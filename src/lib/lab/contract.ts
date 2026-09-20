export type ReplicaId = string;
export type MessageId = string;
export type CausalRelation = "before" | "after" | "equal" | "concurrent";
export type VersionVector = Readonly<Record<ReplicaId, number>>;

export interface Dot {
  replica: ReplicaId;
  counter: number;
}

export interface ReplicaView {
  id: ReplicaId;
  value: readonly string[];
  clock: VersionVector;
  dots: readonly Dot[];
  context: VersionVector;
}

export interface MessageView {
  id: MessageId;
  from: ReplicaId;
  to: ReplicaId;
  kind: "delta";
  dots: readonly Dot[];
  context: VersionVector;
}

export interface TraceFrame {
  index: number;
  actionLabel: string;
  explanation: string;
  replicas: readonly ReplicaView[];
  messages: readonly MessageView[];
  partitions: readonly string[];
  invariants: Readonly<Record<string, boolean>>;
}

export type LabAction =
  | { type: "add"; replica: ReplicaId; value: string }
  | { type: "remove"; replica: ReplicaId; value: string }
  | { type: "deliver"; message: MessageId }
  | { type: "duplicate"; message: MessageId }
  | { type: "partition"; left: ReplicaId; right: ReplicaId }
  | { type: "heal"; left: ReplicaId; right: ReplicaId }
  | { type: "reset" };

export interface LabError {
  action: LabAction;
  engine: string;
  message: string;
  lastFrame: TraceFrame;
}

export interface SimulationEngine {
  current(): TraceFrame;
  dispatch(action: LabAction): TraceFrame | LabError;
  history(): readonly TraceFrame[];
}

export function compareVectors(
  left: VersionVector,
  right: VersionVector,
): CausalRelation {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  let less = false;
  let greater = false;
  for (const id of ids) {
    const a = left[id] ?? 0;
    const b = right[id] ?? 0;
    less ||= a < b;
    greater ||= a > b;
  }
  if (!less && !greater) return "equal";
  if (less && !greater) return "before";
  if (greater && !less) return "after";
  return "concurrent";
}
