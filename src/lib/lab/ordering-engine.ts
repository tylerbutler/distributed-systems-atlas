import {
  compareVectors, immutable,
  type CausalRelation, type EngineScenario, type LabAction, type LabError, type Observation,
  type OrderingEvent, type OrderingTrace, type SimulationEngine, type TraceFrame, type VersionVector,
} from "./contract";

const lexical = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0;
const pair = (left: string, right: string): string => [left, right].sort(lexical).join(":");

type EventGraph = readonly Pick<OrderingEvent, "id" | "predecessors">[];
type Ancestors = ReadonlyMap<string, ReadonlySet<string>>;
const reachability = new WeakMap<EventGraph, Ancestors>();

export function compareEvents(
  events: EventGraph, left: string, right: string,
): CausalRelation {
  let ancestors = reachability.get(events);
  if (!ancestors) {
    const graph = new Map(events.map((event) => [event.id, event.predecessors]));
    const computed = new Map<string, ReadonlySet<string>>();
    for (const [id, predecessors] of graph) {
      const pending = [...predecessors];
      const visited = new Set<string>();
      while (pending.length) {
        const predecessor = pending.pop()!;
        if (visited.has(predecessor)) continue;
        visited.add(predecessor);
        pending.push(...(graph.get(predecessor) ?? []));
      }
      computed.set(id, visited);
    }
    ancestors = computed;
    // Mutable caller graphs must reflect edits on the next comparison.
    if (Object.isFrozen(events) && events.every((event) =>
      Object.isFrozen(event) && Object.isFrozen(event.predecessors))) {
      reachability.set(events, ancestors);
    }
  }
  if (!ancestors.has(left) || !ancestors.has(right)) throw new Error("cannot compare unknown events");
  if (left === right) return "equal";
  return ancestors.get(right)!.has(left) ? "before" : ancestors.get(left)!.has(right) ? "after" : "concurrent";
}

/** This display order adds replica-ID tie breaking, not causal edges. */
export function lamportOrder(events: readonly OrderingEvent[]): OrderingEvent[] {
  if (events.some((event) => event.lamport === undefined)) throw new Error("Lamport timestamps are required");
  return [...events].sort((left, right) =>
    left.lamport! - right.lamport! || lexical(left.replica, right.replica) || lexical(left.id, right.id));
}

interface ReplicaState {
  id: string;
  events: OrderingEvent[];
  observed: Set<string>;
  clock: number;
  vector: Record<string, number>;
}

interface QueuedMessage {
  id: string;
  from: string;
  to: string;
  observed: string[];
  predecessors: string[];
  clock: number;
  vector: VersionVector;
}

export function createOrderingEngine(config: EngineScenario): SimulationEngine {
  const { id, orderingMode: mode } = config;
  if (!mode || !["history", "partial-order", "lamport", "vector"].includes(mode)) {
    throw new Error("ordering engines require a valid orderingMode");
  }
  const replicaIds = [...config.replicas].sort(lexical);
  if (!replicaIds.length || new Set(replicaIds).size !== replicaIds.length
    || replicaIds.some((replica) => !replica.trim() || replica.includes(":"))) {
    throw new Error("replica IDs must be nonempty, unique, and must not contain ':'");
  }
  if (config.initialValues.length) throw new Error("ordering engines start with empty local histories");
  const clocked = mode === "lamport" || mode === "vector";
  const initialReplicas = () => new Map(replicaIds.map((replica) => [replica, {
    id: replica, events: [], observed: new Set<string>(), clock: 0,
    vector: Object.fromEntries(replicaIds.map((actor) => [actor, 0])),
  } satisfies ReplicaState]));
  let replicas: Map<string, ReplicaState> = initialReplicas();
  const graph = new Map<string, OrderingEvent>();
  const ancestors = new Map<string, ReadonlySet<string>>();
  let events: readonly OrderingEvent[] = Object.freeze([]);
  let checkedEvents: EventGraph | undefined;
  let checkedInvariants: TraceFrame["invariants"];
  let messages: QueuedMessage[] = [];
  const messageIds = new Set<string>();
  const partitions = new Set<string>();
  let comparisons: OrderingTrace["comparisons"] = [];
  let vectorComparisons: OrderingTrace["vectorComparisons"] = [];
  let eventNumber = 0;
  let messageNumber = 0;
  let copyNumber = 0;

  function observation(state: { events: readonly OrderingEvent[]; observed: Iterable<string>; clock: number; vector: VersionVector }): Observation {
    if (mode === "lamport") return { observation: "scalar-clock", clock: state.clock };
    if (mode === "vector") return { observation: "vector-clock", clock: state.vector };
    return { observation: "history", events: state.events, observed: [...state.observed].sort(lexical) };
  }

  function invariantChecks(): TraceFrame["invariants"] {
    if (checkedEvents === events) return checkedInvariants;
    const states = [...replicas.values()];
    const relation = (left: string, right: string) => compareEvents(events, left, right);
    const invariants: Record<string, boolean> = {
      localHistoryIsOrdered: states.every((state) => state.events.every((event, index) =>
        index === 0 || event.predecessors.includes(state.events[index - 1].id))),
      observationsHaveCausalPaths: states.every((state) => {
        const latest = state.events.at(-1);
        return events.every((event) => state.observed.has(event.id)
          === Boolean(latest && ["before", "equal"].includes(relation(event.id, latest.id))));
      }),
    };
    if (mode === "lamport") {
      invariants.localClockIncreases = states.every((state) => state.events.every((event, index) =>
        event.lamport! > (state.events[index - 1]?.lamport ?? 0)));
      invariants.happensBeforeImpliesLowerTimestamp = events.every((event) =>
        event.predecessors.every((predecessor) => graph.get(predecessor)!.lamport! < event.lamport!));
    }
    if (mode === "vector") {
      invariants.vectorMatchesGraph = events.every((left) => events.every((right) =>
        compareVectors(left.vector!, right.vector!) === relation(left.id, right.id)));
      invariants.oneComponentPerReplica = states.every((state) => Object.keys(state.vector).length === replicaIds.length);
    }
    checkedEvents = events;
    checkedInvariants = immutable(invariants);
    return checkedInvariants;
  }

  function frame(index: number, action: LabAction | null, actionLabel: string, explanation: string): TraceFrame {
    const snapshot = structuredClone({
      index, action, actionLabel, explanation,
      replicas: [...replicas.values()].map((state) => ({
        id: state.id,
        value: state.events.flatMap((event) => event.value === undefined ? [] : [event.value]),
        ...observation(state),
      })),
      messages: messages.map((message) => ({
        id: message.id, from: message.from, to: message.to, kind: "event" as const,
        ...observation({
          ...message,
          events: message.observed.map((event) => graph.get(event)!),
        }),
      })),
      partitions: [...partitions].sort(lexical),
      ordering: { comparisons, vectorComparisons },
    });
    return immutable({
      ...snapshot,
      ordering: { ...snapshot.ordering, events },
      invariants: invariantChecks(),
    });
  }

  let frames: readonly TraceFrame[] = Object.freeze([
    frame(0, null, "initial", "Each replica starts with an empty local history. No messages have been delivered."),
  ]);
  const current = () => frames[frames.length - 1];
  const error = (action: LabAction, message: string): LabError => ({ action, engine: id, message, lastFrame: current() });
  function append(action: LabAction, label: string, explanation: string): TraceFrame {
    const next = frame(frames.length, action, label, explanation);
    frames = Object.freeze([...frames, next]);
    return next;
  }
  function invalidEvent(event: string | undefined): boolean {
    return event !== undefined && (!event.trim() || graph.has(event));
  }
  function record(replica: ReplicaState, kind: OrderingEvent["kind"], eventId?: string, value?: string, incoming?: QueuedMessage): void {
    let generated = eventId;
    if (generated === undefined) {
      do { generated = `e${++eventNumber}:${replica.id}`; } while (graph.has(generated));
    }
    const previous = replica.events.at(-1);
    const predecessors = [...new Set([
      ...(previous ? [previous.id] : []), ...(incoming?.predecessors ?? []),
    ])];
    replica.clock = Math.max(replica.clock, incoming?.clock ?? 0) + 1;
    for (const actor of replicaIds) {
      replica.vector[actor] = Math.max(replica.vector[actor], incoming?.vector[actor] ?? 0);
    }
    replica.vector[replica.id]++;
    const event: OrderingEvent = {
      id: generated, replica: replica.id, kind, predecessors,
      ...(value === undefined ? {} : { value }),
      ...(mode === "lamport" ? { lamport: replica.clock } : {}),
      ...(mode === "vector" ? { vector: { ...replica.vector } } : {}),
    };
    const observedAncestors = new Set<string>();
    for (const predecessor of predecessors) {
      observedAncestors.add(predecessor);
      for (const ancestor of ancestors.get(predecessor)!) observedAncestors.add(ancestor);
    }
    ancestors.set(event.id, observedAncestors);
    graph.set(event.id, immutable(event));
    events = Object.freeze([...events, event]);
    // Share immutable ancestor sets, but isolate each historical graph's membership.
    reachability.set(events, new Map(ancestors));
    replica.events.push(event);
    for (const observed of incoming?.observed ?? []) replica.observed.add(observed);
    replica.observed.add(event.id);
  }

  function dispatch(action: LabAction): TraceFrame | LabError {
    switch (action.type) {
      case "local-event": {
        const replica = replicas.get(action.replica);
        if (!replica) return error(action, `unknown replica: ${action.replica}`);
        if (invalidEvent(action.event)) return error(action, "event ID must be nonempty and unique");
        record(replica, "local", action.event, action.value);
        return append(action, `local event at ${replica.id}`, `Only ${replica.id} records this event; no message is sent.`);
      }
      case "send": {
        const replica = replicas.get(action.from);
        if (!replica) return error(action, `unknown replica: ${action.from}`);
        if (!replicas.has(action.to)) return error(action, `unknown replica: ${action.to}`);
        if (action.from === action.to) return error(action, "a message requires two distinct replicas");
        if (clocked && invalidEvent(action.event)) return error(action, "event ID must be nonempty and unique");
        if (action.message !== undefined && (!action.message.trim() || messageIds.has(action.message))) {
          return error(action, "message ID must be nonempty and unique");
        }
        if (clocked) record(replica, "send", action.event);
        let messageId = action.message;
        if (messageId === undefined) {
          do { messageId = `m${++messageNumber}`; } while (messageIds.has(messageId));
        }
        messageIds.add(messageId);
        messages.push({
          id: messageId, from: action.from, to: action.to,
          observed: [...replica.observed],
          predecessors: replica.events.slice(-1).map((event) => event.id),
          clock: replica.clock, vector: { ...replica.vector },
        });
        return append(action, `send ${messageId}`, clocked
          ? `${action.from} increments its clock and sends a snapshot to ${action.to}.`
          : `${action.from} sends its observed history to ${action.to}; later events are not in this snapshot.`);
      }
      case "duplicate":
      case "deliver": {
        const index = messages.findIndex((message) => message.id === action.message);
        if (index < 0) return error(action, `unknown queued message: ${action.message}`);
        const message = messages[index];
        if (action.type === "duplicate") {
          let copyId: string;
          do { copyId = `${message.id}:copy${++copyNumber}`; } while (messageIds.has(copyId));
          messageIds.add(copyId);
          messages.push({ ...message, id: copyId });
          return append(action, `duplicate ${message.id}`, `Queued ${copyId} with the same send-time snapshot.`);
        }
        if (partitions.has(pair(message.from, message.to))) return error(action, "message crosses an active partition");
        if (invalidEvent(action.event)) return error(action, "event ID must be nonempty and unique");
        record(replicas.get(message.to)!, "receive", action.event, undefined, message);
        messages.splice(index, 1);
        return append(action, `deliver ${message.id}`, mode === "lamport"
          ? `${message.to} sets its clock to max(local, message) + 1. Each duplicate arrival is a new receive event.`
          : mode === "vector"
            ? `${message.to} merges component maxima, then increments its own component. Each arrival is a new receive event.`
            : `${message.to} records a receive event and learns only the history included in this message.`);
      }
      case "partition":
      case "heal": {
        if (!replicas.has(action.left)) return error(action, `unknown replica: ${action.left}`);
        if (!replicas.has(action.right)) return error(action, `unknown replica: ${action.right}`);
        if (action.left === action.right) return error(action, "a link requires two distinct replicas");
        const key = pair(action.left, action.right);
        if (action.type === "partition") partitions.add(key);
        else partitions.delete(key);
        return append(action, `${action.type} ${key}`, action.type === "partition"
          ? `Blocked delivery across ${key}; local events and sends can continue.`
          : `Allowed delivery across ${key}; queued messages remain pending.`);
      }
      case "compare-events": {
        if (action.pairs.some(([left, right]) => !graph.has(left) || !graph.has(right))) {
          return error(action, "cannot compare unknown events");
        }
        comparisons = action.pairs.map(([left, right]) => ({
          left, right, relation: compareEvents(events, left, right),
        }));
        return append(action, "compare events", "Causality follows local predecessor and message edges, not button order.");
      }
      case "compare-vectors": {
        if (mode !== "vector") return error(action, `unsupported action for ${mode}: ${action.type}`);
        if (![action.left, action.right].every((vector) =>
          Object.values(vector).every((value) => Number.isSafeInteger(value) && value >= 0))) {
          return error(action, "vector components must be nonnegative safe integers");
        }
        vectorComparisons = [...vectorComparisons, {
          left: { ...action.left }, right: { ...action.right }, relation: compareVectors(action.left, action.right),
        }];
        return append(action, "compare vectors", "Compare every component; a missing component is zero.");
      }
      case "reset":
        replicas = initialReplicas();
        graph.clear();
        ancestors.clear();
        events = Object.freeze([]);
        messages = [];
        messageIds.clear();
        partitions.clear();
        comparisons = [];
        vectorComparisons = [];
        eventNumber = messageNumber = copyNumber = 0;
        frames = Object.freeze([frame(0, null, "initial", "Each replica starts with an empty local history. No messages have been delivered.")]);
        return current();
      default:
        return error(action, `unsupported action for ${mode}: ${action.type}`);
    }
  }
  return { current, dispatch, history: () => frames };
}
