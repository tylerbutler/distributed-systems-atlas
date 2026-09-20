export type ReplicaId = string;
export type MessageId = string;
export type CausalRelation = "before" | "after" | "equal" | "concurrent";
export type VersionVector = Readonly<Record<ReplicaId, number>>;
export type EngineKind = "ordering" | "dots" | "mv-register" | "or-set";

export interface EngineScenario {
  readonly id: string;
  readonly kind: EngineKind;
  /** Nonempty, unique IDs; ":" is reserved for message and partition keys. */
  readonly replicas: readonly ReplicaId[];
  readonly initialValues: readonly string[];
}

export interface Dot {
  readonly replica: ReplicaId;
  readonly counter: number;
}

export interface DotsObservation {
  readonly observation: "dots";
  readonly clock: VersionVector;
  readonly dots: readonly Dot[];
  readonly context: VersionVector;
}

export type Observation =
  | DotsObservation
  | {
    readonly observation: "history";
    readonly events: readonly { readonly id: string; readonly predecessors: readonly string[] }[];
    readonly observed: readonly string[];
  }
  | { readonly observation: "scalar-clock"; readonly clock: number }
  | { readonly observation: "vector-clock"; readonly clock: VersionVector }
  | {
    readonly observation: "mv-register";
    readonly siblings: readonly { readonly value: string; readonly version: VersionVector }[];
    readonly context: VersionVector;
  }
  | {
    readonly observation: "or-set";
    readonly members: readonly {
      readonly value: string;
      readonly dots: readonly Dot[];
      readonly removed: readonly Dot[];
    }[];
    readonly context: VersionVector;
  };

export type ReplicaView<O extends Observation = Observation> = O & {
  readonly id: ReplicaId;
  readonly value: readonly string[];
};

export type MessageView<O extends Observation = Observation> = O & {
  readonly id: MessageId;
  readonly from: ReplicaId;
  readonly to: ReplicaId;
  readonly kind: "delta" | "event";
};

export interface TraceFrame<O extends Observation = Observation> {
  readonly index: number;
  /** Null for the initial state, including reset's restored initial frame. */
  readonly action: LabAction | null;
  readonly actionLabel: string;
  readonly explanation: string;
  readonly replicas: readonly ReplicaView<O>[];
  readonly messages: readonly MessageView<O>[];
  readonly partitions: readonly string[];
  readonly invariants: Readonly<Record<string, boolean>>;
}

export type LabAction =
  | { readonly type: "local-event"; readonly replica: ReplicaId; readonly value?: string }
  | { readonly type: "send"; readonly from: ReplicaId; readonly to: ReplicaId }
  | { readonly type: "write"; readonly replica: ReplicaId; readonly value: string }
  | { readonly type: "add"; readonly replica: ReplicaId; readonly value: string }
  | { readonly type: "remove"; readonly replica: ReplicaId; readonly value: string }
  | { readonly type: "deliver"; readonly message: MessageId }
  | { readonly type: "duplicate"; readonly message: MessageId }
  | { readonly type: "partition"; readonly left: ReplicaId; readonly right: ReplicaId }
  | { readonly type: "heal"; readonly left: ReplicaId; readonly right: ReplicaId }
  | { readonly type: "reset" };

export interface LabError<O extends Observation = Observation> {
  action: LabAction;
  engine: string;
  message: string;
  lastFrame: TraceFrame<O>;
}

export interface SimulationEngine<O extends Observation = Observation> {
  current(): TraceFrame<O>;
  dispatch(action: LabAction): TraceFrame<O> | LabError<O>;
  history(): readonly TraceFrame<O>[];
}

/** Freeze owned snapshot data, never engine state or caller-owned input. */
export function immutable<T>(value: T): T {
  if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) immutable(child);
    Object.freeze(value);
  }
  return value;
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
