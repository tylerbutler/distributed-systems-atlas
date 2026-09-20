import type {
  Dot,
  DotsObservation,
  EngineScenario,
  LabAction,
  LabError,
  ReplicaView,
  SimulationEngine,
  TraceFrame,
  VersionVector,
} from "./contract";
import { immutable } from "./contract";

interface ElementState {
  adds: Map<string, Dot>;
  removed: Set<string>;
}

interface ReplicaState {
  id: string;
  clock: Record<string, number>;
  elements: Map<string, ElementState>;
}

interface QueuedMessage {
  id: string;
  from: string;
  to: string;
  elements: readonly {
    value: string;
    adds: readonly Dot[];
    removed: readonly string[];
  }[];
  context: VersionVector;
}

export type CausalScenario = Omit<EngineScenario, "kind">;

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dotKey(dot: Dot): string {
  return `${dot.replica}:${dot.counter}`;
}

function sortDots(dots: Iterable<Dot>): Dot[] {
  return [...dots].sort(
    (left, right) => lexical(left.replica, right.replica) || left.counter - right.counter,
  );
}

function liveDots(element: ElementState): Dot[] {
  return [...element.adds.values()].filter((dot) => !element.removed.has(dotKey(dot)));
}

export function createCausalEngine(config: CausalScenario): SimulationEngine<DotsObservation> {
  const id = config.id;
  const replicaIds = [...config.replicas].sort(lexical);
  if (!replicaIds.length || new Set(replicaIds).size !== replicaIds.length) {
    throw new Error("replicas must be nonempty and unique");
  }
  if (replicaIds.some((replica) => replica.includes(":"))) {
    throw new Error("replica IDs must not contain ':'");
  }
  const initialValues = [...new Set(config.initialValues)].sort(lexical);

  function initialReplicas(): Map<string, ReplicaState> {
    return new Map(replicaIds.map((replica) => [
      replica,
      {
        id: replica,
        clock: Object.fromEntries(replicaIds.map((actor, index) => [
          actor, index === 0 ? initialValues.length : 0,
        ])),
        elements: new Map(initialValues.map((value, index) => {
          // Shared seed dots let any replica remove an initial value.
          const dot = { replica: replicaIds[0], counter: index + 1 };
          return [value, { adds: new Map([[dotKey(dot), dot]]), removed: new Set<string>() }];
        })),
      },
    ]));
  }

  let replicas = initialReplicas();
  let messages: QueuedMessage[] = [];
  const partitions = new Set<string>();
  let operationNumber = 0;
  let copyNumber = 0;

  function frame(index: number, action: LabAction | null, actionLabel: string, explanation: string): TraceFrame<DotsObservation> {
    const states = [...replicas.values()];
    const views: ReplicaView<DotsObservation>[] = states.map((replica) => ({
      observation: "dots",
      id: replica.id,
      value: [...replica.elements]
        .filter(([, element]) => liveDots(element).length > 0)
        .map(([value]) => value)
        .sort(lexical),
      clock: { ...replica.clock },
      dots: sortDots([...replica.elements.values()].flatMap(liveDots)),
      context: { ...replica.clock },
    }));
    const metadata = states.map((replica) => JSON.stringify({
      clock: replica.clock,
      elements: [...replica.elements]
        .sort(([left], [right]) => lexical(left, right))
        .map(([value, element]) => ({
          value,
          adds: sortDots(element.adds.values()),
          removed: [...element.removed].sort(lexical),
        })),
    }));
    return immutable({
      index,
      action: action ? { ...action } : null,
      actionLabel,
      explanation,
      replicas: views,
      messages: messages.map((message) => ({
        id: message.id,
        from: message.from,
        to: message.to,
        kind: "delta" as const,
        observation: "dots" as const,
        clock: { ...message.context },
        dots: sortDots(message.elements.flatMap((element) =>
          element.adds.filter((dot) => !element.removed.includes(dotKey(dot))),
        )),
        context: { ...message.context },
      })),
      partitions: [...partitions].sort(lexical),
      invariants: {
        uniqueDots: states.every((replica) => {
          const dots = [...replica.elements.values()].flatMap((element) => [...element.adds.keys()]);
          return new Set(dots).size === dots.length;
        }),
        removedDotsStayRemoved: states.every((replica, replicaIndex) => {
          const visible = new Set(views[replicaIndex].dots.map(dotKey));
          return [...replica.elements.values()].every((element) =>
            [...element.removed].every((key) => !visible.has(key)),
          );
        }),
        converged: messages.length === 0
          && views.every((view) => JSON.stringify(view.value) === JSON.stringify(views[0].value))
          && metadata.every((entry) => entry === metadata[0]),
      },
    });
  }

  const initialFrame = frame(0, null, "initial", "Replicas share the initial values and causal state.");
  let frames: readonly TraceFrame<DotsObservation>[] = Object.freeze([initialFrame]);

  function current(): TraceFrame<DotsObservation> {
    return frames[frames.length - 1];
  }

  function error(action: LabAction, message: string): LabError<DotsObservation> {
    return { action, engine: id, message, lastFrame: current() };
  }

  function append(action: LabAction, actionLabel: string, explanation: string): TraceFrame<DotsObservation> {
    const next = frame(frames.length, action, actionLabel, explanation);
    frames = Object.freeze([...frames, next]);
    return next;
  }

  function pair(left: string, right: string): string {
    return [left, right].sort(lexical).join(":");
  }

  function dispatch(action: LabAction): TraceFrame<DotsObservation> | LabError<DotsObservation> {
    switch (action.type) {
      case "add":
      case "remove": {
        const replica = replicas.get(action.replica);
        if (!replica) return error(action, `unknown replica: ${action.replica}`);
        const element = replica.elements.get(action.value)
          ?? { adds: new Map<string, Dot>(), removed: new Set<string>() };
        if (action.type === "add") {
          const dot = { replica: replica.id, counter: ++replica.clock[replica.id] };
          element.adds.set(dotKey(dot), dot);
        } else {
          for (const key of element.adds.keys()) element.removed.add(key);
        }
        replica.elements.set(action.value, element);
        // Include causal predecessors across all values, even when their own messages arrive later.
        const elements = [...replica.elements].map(([value, state]) => ({
          value,
          adds: [...state.adds.values()],
          removed: [...state.removed],
        }));
        operationNumber++;
        for (const target of replicaIds) {
          if (target === replica.id) continue;
          messages.push({
            id: `m${operationNumber}:${replica.id}:${target}`,
            from: replica.id,
            to: target,
            elements,
            context: { ...replica.clock },
          });
        }
        return append(
          action,
          `${action.type} ${action.value} at ${replica.id}`,
          action.type === "add"
            ? `Added ${action.value} with dot ${replica.id}:${replica.clock[replica.id]}; queued a delta with causal state for each peer.`
            : `Removed ${element.removed.size} observed dots for ${action.value}; concurrent adds remain valid.`,
        );
      }
      case "deliver":
      case "duplicate": {
        const index = messages.findIndex((message) => message.id === action.message);
        if (index < 0) return error(action, `unknown queued message: ${action.message}`);
        const message = messages[index];
        if (action.type === "duplicate") {
          const copy = { ...message, id: `${message.id}:copy${++copyNumber}` };
          messages.push(copy);
          return append(action, `duplicate ${message.id}`, `Queued ${copy.id} with the same causal payload.`);
        }
        if (partitions.has(pair(message.from, message.to))) {
          return error(action, "message crosses an active partition");
        }
        const replica = replicas.get(message.to)!;
        for (const incoming of message.elements) {
          const element = replica.elements.get(incoming.value)
            ?? { adds: new Map<string, Dot>(), removed: new Set<string>() };
          for (const dot of incoming.adds) element.adds.set(dotKey(dot), dot);
          for (const key of incoming.removed) element.removed.add(key);
          replica.elements.set(incoming.value, element);
        }
        for (const actor of replicaIds) {
          replica.clock[actor] = Math.max(replica.clock[actor], message.context[actor]);
        }
        messages.splice(index, 1);
        return append(
          action,
          `deliver ${message.id}`,
          `Merged add dots, removed dots, and vector maxima from ${message.from} into ${message.to}.`,
        );
      }
      case "partition":
      case "heal": {
        if (!replicas.has(action.left)) return error(action, `unknown replica: ${action.left}`);
        if (!replicas.has(action.right)) return error(action, `unknown replica: ${action.right}`);
        if (action.left === action.right) return error(action, "a link requires two distinct replicas");
        const key = pair(action.left, action.right);
        if (action.type === "partition") partitions.add(key);
        else partitions.delete(key);
        return append(
          action,
          `${action.type} ${key}`,
          action.type === "partition"
            ? `Blocked delivery across ${key}; queued messages are retained.`
            : `Allowed delivery across ${key}; queued messages remain pending.`,
        );
      }
      case "reset":
        replicas = initialReplicas();
        messages = [];
        partitions.clear();
        operationNumber = 0;
        copyNumber = 0;
        frames = Object.freeze([initialFrame]);
        return initialFrame;
      case "local-event":
      case "send":
      case "write":
      case "compare-events":
      case "compare-vectors":
        return error(action, `unsupported action for dots: ${action.type}`);
    }
  }

  return { current, dispatch, history: () => frames };
}
