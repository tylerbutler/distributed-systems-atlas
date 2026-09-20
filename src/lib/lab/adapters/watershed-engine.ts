import {
  add, createMvRegister, createOrSet, inspect, merge, remove, write,
  type Change, type Operation, type Result, type State, type Tag,
} from "@tylerbutler/watershed-atlas";
import {
  immutable, type EngineScenario, type LabAction, type LabError, type Observation,
  type SimulationEngine, type TraceFrame, type VersionVector,
} from "../contract";

export const tagKey = (tag: Tag): string => `${tag.replicaId}:${tag.counter}`;
const pair = (left: string, right: string): string => [left, right].sort().join(":");

export function vector(tags: readonly Tag[], replicas: readonly string[]): VersionVector {
  const components = new Map(replicas.map((id) => [id, 0]));
  for (const tag of tags) components.set(tag.replicaId, Math.max(components.get(tag.replicaId) ?? 0, tag.counter));
  return Object.fromEntries(components);
}

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

interface QueuedMessage {
  id: string;
  from: string;
  to: string;
  operation: Operation;
}

export function createWatershedEngine<O extends Observation>(
  config: EngineScenario,
  kind: "mv-register" | "or-set",
  observe: (state: State, authored: readonly Operation[], replicas: readonly string[]) => O,
): SimulationEngine<O> {
  if (config.kind !== kind) throw new Error(`expected ${kind} scenario`);
  const id = config.id;
  const replicaIds = [...config.replicas].sort();
  if (!replicaIds.length || new Set(replicaIds).size !== replicaIds.length
    || replicaIds.some((replica) => !replica.trim() || replica.includes(":"))) {
    throw new Error("replica IDs must be nonempty, unique, and must not contain ':'");
  }
  const initialValues = [...new Set(config.initialValues)].sort();
  if (kind === "mv-register" && initialValues.length > 1) {
    throw new Error("an MV-register accepts at most one shared initial value; use writes to create siblings");
  }
  const create: (replica: string) => Result<State> = kind === "mv-register" ? createMvRegister : createOrSet;
  let authored: Operation[] = [];

  function initialReplicas(): Map<string, State> {
    authored = [];
    let seed: State = unwrap(create(replicaIds[0]));
    for (const value of initialValues) {
      const change = unwrap<Change>(kind === "mv-register" ? write(seed, value) : add(seed, value));
      seed = change.state;
      authored.push(change.operation);
    }
    return new Map(replicaIds.map((replica) => [
      replica, replica === seed.replicaId ? seed : unwrap(merge(unwrap(create(replica)), seed)),
    ]));
  }

  let replicas = initialReplicas();
  let messages: QueuedMessage[] = [];
  const partitions = new Set<string>();
  let operationNumber = 0;
  let copyNumber = 0;
  let removeTargetsOnlyObservedDots = true;
  let concurrentAddSurvives = true;

  function frame(index: number, action: LabAction | null, actionLabel: string, explanation: string): TraceFrame<O> {
    const states = [...replicas.values()].map((state) => unwrap(inspect(state)));
    const metadata = states.map(({ causal: { replicaId: _writer, ...causal } }) => JSON.stringify(causal));
    const tags = states.map(({ causal }) => causal.kind === "mv-register"
      ? causal.entries.map((entry) => entry.tag)
      : causal.entries.flatMap((entry) => entry.tags));
    return immutable(structuredClone({
      index, action, actionLabel, explanation,
      replicas: states.map(({ values, causal }) => ({
        id: causal.replicaId, value: values, ...observe(causal, authored, replicaIds),
      })),
      messages: messages.map((message) => ({
        id: message.id, from: message.from, to: message.to, kind: "delta" as const,
        ...observe(message.operation.delta, authored, replicaIds),
      })),
      partitions: [...partitions].sort(),
      invariants: {
        uniqueTags: tags.every((entries) => new Set(entries.map(tagKey)).size === entries.length),
        ...(kind === "or-set" ? {
          removeTargetsOnlyObservedDots,
          concurrentAddSurvives,
          removedDotsStayRemoved: states.every(({ causal }, index) => causal.kind === "or-set"
            && causal.tombstones.every((removed) => !tags[index].some((live) => tagKey(live) === tagKey(removed)))),
        } : {}),
        converged: messages.length === 0 && metadata.every((state) => state === metadata[0]),
      },
    }));
  }

  const initialFrame = frame(0, null, "initial", "Replicas share initial state created by Watershed. No messages are queued.");
  let frames: readonly TraceFrame<O>[] = Object.freeze([initialFrame]);
  const current = () => frames[frames.length - 1];
  const error = (action: LabAction, message: string): LabError<O> => ({ action, engine: id, message, lastFrame: current() });
  function append(action: LabAction, label: string, explanation: string): TraceFrame<O> {
    const next = frame(frames.length, action, label, explanation);
    frames = Object.freeze([...frames, next]);
    return next;
  }

  function dispatch(action: LabAction): TraceFrame<O> | LabError<O> {
    switch (action.type) {
      case "write":
      case "add":
      case "remove": {
        if ((kind === "mv-register") !== (action.type === "write")) {
          return error(action, `unsupported action for ${kind}: ${action.type}`);
        }
        const state = replicas.get(action.replica);
        if (!state) return error(action, `unknown replica: ${action.replica}`);
        const result = action.type === "write" ? write(state, action.value)
          : action.type === "add" ? add(state, action.value) : remove(state, action.value);
        if (!result.ok) return error(action, `${result.error.tag}: ${result.error.message}`);
        const change = result.value;
        if (action.type === "remove" && state.kind === "or-set" && change.operation.delta.kind === "or-set") {
          const observed = state.entries.find((entry) => entry.value === action.value)?.tags ?? [];
          const removed = change.operation.delta.tombstones;
          removeTargetsOnlyObservedDots &&= removed.length === observed.length
            && removed.every((tag) => observed.some((other) => tagKey(other) === tagKey(tag)));
        }
        replicas.set(action.replica, change.state);
        authored.push(change.operation);
        operationNumber++;
        for (const to of replicaIds) {
          if (to !== action.replica) messages.push({
            id: `m${operationNumber}:${action.replica}:${to}`, from: action.replica, to, operation: change.operation,
          });
        }
        return append(action, `${action.type} ${action.value} at ${action.replica}`,
          action.type === "write"
            ? "Watershed wrote a new version that replaces only observed siblings; its authored delta is queued for each peer."
            : action.type === "add"
              ? "Watershed allocated a new addition tag; its authored delta is queued for each peer."
              : "Watershed removed only observed addition tags. Concurrent additions remain valid; the removal delta is queued.");
      }
      case "duplicate":
      case "deliver": {
        const index = messages.findIndex((message) => message.id === action.message);
        if (index < 0) return error(action, `unknown queued message: ${action.message}`);
        const message = messages[index];
        if (action.type === "duplicate") {
          const copy = { ...message, id: `${message.id}:copy${++copyNumber}` };
          messages.push(copy);
          return append(action, `duplicate ${message.id}`, `Queued ${copy.id} with the same Watershed delta and tags.`);
        }
        if (partitions.has(pair(message.from, message.to))) return error(action, "message crosses an active partition");
        const before = replicas.get(message.to)!;
        const result = merge(before, message.operation);
        if (!result.ok) return error(action, `${result.error.tag}: ${result.error.message}`);
        const after = result.value;
        const incoming = message.operation.delta;
        if (before.kind === "or-set" && incoming.kind === "or-set" && after.kind === "or-set") {
          const removed = new Set([...before.tombstones, ...incoming.tombstones].map(tagKey));
          const live = new Set(after.entries.flatMap((entry) => entry.tags.map(tagKey)));
          concurrentAddSurvives &&= [...before.entries, ...incoming.entries].every((entry) =>
            entry.tags.every((tag) => removed.has(tagKey(tag)) || live.has(tagKey(tag))));
        }
        replicas.set(message.to, after);
        messages.splice(index, 1);
        return append(action, `deliver ${message.id}`,
          `Watershed merged the authored delta from ${message.from} into ${message.to}; no local operation was replayed.`);
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
          ? `Blocked delivery across ${key}; queued messages are retained.`
          : `Allowed delivery across ${key}; queued messages remain pending.`);
      }
      case "reset":
        replicas = initialReplicas();
        messages = [];
        partitions.clear();
        operationNumber = 0;
        copyNumber = 0;
        removeTargetsOnlyObservedDots = true;
        concurrentAddSurvives = true;
        frames = Object.freeze([initialFrame]);
        return initialFrame;
      default:
        return error(action, `unsupported action for ${kind}: ${action.type}`);
    }
  }

  return { current, dispatch, history: () => frames };
}
