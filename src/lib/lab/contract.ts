export type ReplicaId = string;
export type MessageId = string;
export type CausalRelation = "before" | "after" | "equal" | "concurrent";
export type VersionVector = Readonly<Record<ReplicaId, number>>;

export interface Dot {
  readonly replica: ReplicaId;
  readonly counter: number;
}

export interface ReplicaView {
  readonly id: ReplicaId;
  readonly value: readonly string[];
  readonly clock: VersionVector;
  readonly dots: readonly Dot[];
  readonly context: VersionVector;
}

export interface MessageView {
  readonly id: MessageId;
  readonly from: ReplicaId;
  readonly to: ReplicaId;
  readonly kind: "delta";
  readonly dots: readonly Dot[];
  readonly context: VersionVector;
}

export interface TraceFrame {
  readonly index: number;
  readonly actionLabel: string;
  readonly explanation: string;
  readonly replicas: readonly ReplicaView[];
  readonly messages: readonly MessageView[];
  readonly partitions: readonly string[];
  readonly invariants: Readonly<Record<string, boolean>>;
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
