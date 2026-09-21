import {
  createSharedCounterRoom,
  deliverOneSharedCounterOperation,
  stageSharedCounterRace,
  updateSharedCounterRoom,
  type Result,
  type SharedCounterRoom,
  type SharedCounterRoomView,
  type TransportDelivery,
} from "@atlas/toolkit";

export type ReplicaId = "A" | "B" | "C";
export type SharedCounterDemoPhase = "initial" | "queued" | "delivered";
export type SharedCounterOperation = {
  sequenceNumber: number;
  author: ReplicaId;
  amount: number;
};
export type SharedCounterDelivery = TransportDelivery & {
  amount: number;
};

type QueuedUpdate = {
  author: ReplicaId;
  amount: number;
};

const REPLICA_IDS: readonly ReplicaId[] = ["A", "B", "C"];
const MAX_RECORDED_DELIVERIES = 36;
const MAX_RECORDED_OPERATIONS = 12;
const USER_NAMES: Record<ReplicaId, string> = {
  A: "Alice",
  B: "Bob",
  C: "Carol",
};

export type SharedCounterDemoState = {
  phase: SharedCounterDemoPhase;
  room: SharedCounterRoom;
  view: SharedCounterRoomView;
  baselineSequence: number;
  queuedUpdates: QueuedUpdate[];
  operations: SharedCounterOperation[];
  deliveries: SharedCounterDelivery[];
  latestDeliveries: SharedCounterDelivery[];
  result: string;
};

export type SharedCounterDemoView = {
  phase: SharedCounterDemoPhase;
  replicas: Array<{
    id: ReplicaId;
    value: number;
    lastAppliedSequence: number;
  }>;
  queuedOperations: number;
  sequenceNumber: number;
  operations: SharedCounterOperation[];
  deliveries: SharedCounterDelivery[];
  latestDeliveries: SharedCounterDelivery[];
  result: string;
  canDeliver: boolean;
};

export type SharedCounterDemoResult =
  | { ok: true; state: SharedCounterDemoState }
  | { ok: false; state: SharedCounterDemoState; error: string };

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

export function sharedCounterUserName(replica: ReplicaId): string {
  return USER_NAMES[replica];
}

export function createSharedCounterDemo(): SharedCounterDemoState {
  const created = value(createSharedCounterRoom());
  return {
    phase: "initial",
    room: created.room,
    view: created.view,
    baselineSequence: created.view.sequenceNumber,
    queuedUpdates: [],
    operations: [],
    deliveries: [],
    latestDeliveries: [],
    result: "Send a signed change, or race Alice's count against Bob's correction.",
  };
}

function failure(
  state: SharedCounterDemoState,
  action: string,
  error: unknown,
): SharedCounterDemoResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    state,
    error: `${action} was not completed: ${message}. The last valid values are unchanged.`,
  };
}

function recordUpdate(
  state: SharedCounterDemoState,
  update: QueuedUpdate,
  roomUpdate: Pick<SharedCounterDemoState, "room" | "view">,
): SharedCounterDemoState {
  return {
    ...state,
    phase: "queued",
    ...roomUpdate,
    queuedUpdates: [...state.queuedUpdates, update],
    latestDeliveries: [],
  };
}

export function updateSharedReplica(
  state: SharedCounterDemoState,
  replica: ReplicaId,
  amount: number,
): SharedCounterDemoResult {
  if (amount === 0) {
    return failure(state, `${sharedCounterUserName(replica)} change`, "record a nonzero change");
  }
  try {
    const updated = value(updateSharedCounterRoom(state.room, replica, amount));
    return {
      ok: true,
      state: {
        ...recordUpdate(state, { author: replica, amount }, updated),
        result: `${sharedCounterUserName(replica)} sent ${formatSigned(amount)} to the ranger. The note is in transit.`,
      },
    };
  } catch (error) {
    return failure(state, `${sharedCounterUserName(replica)} change`, error);
  }
}

export function stageSharedRace(
  state: SharedCounterDemoState,
): SharedCounterDemoResult {
  try {
    const staged = value(stageSharedCounterRace(state.room));
    const withAlice = recordUpdate(state, { author: "A", amount: 3 }, staged);
    return {
      ok: true,
      state: {
        ...recordUpdate(withAlice, { author: "B", amount: -1 }, staged),
        result: "Alice sent +3 while Bob sent -1. Both notes are in transit to the ranger.",
      },
    };
  } catch (error) {
    return failure(state, "Concurrent signed changes", error);
  }
}

export function deliverNextSharedOperation(
  state: SharedCounterDemoState,
): SharedCounterDemoResult {
  const update = state.queuedUpdates[0];
  if (!update || !state.view.pending) {
    return failure(state, "Sequencer delivery", "send a change first");
  }
  try {
    const delivered = value(deliverOneSharedCounterOperation(state.room));
    const first = delivered.deliveries[0];
    if (!first || first.author !== update.author) {
      throw new Error("the sequenced operation did not match the waiting note");
    }
    const latestDeliveries = delivered.deliveries.map((delivery) => ({
      ...delivery,
      amount: update.amount,
    }));
    const operation = {
      sequenceNumber: first.sequenceNumber,
      author: update.author,
      amount: update.amount,
    };
    const queuedUpdates = state.queuedUpdates.slice(1);
    const complete = queuedUpdates.length === 0;
    const total = delivered.view.replicas[0]?.value ?? 0;
    return {
      ok: true,
      state: {
        ...state,
        phase: complete ? "delivered" : "queued",
        ...delivered,
        queuedUpdates,
        operations: [...state.operations, operation].slice(-MAX_RECORDED_OPERATIONS),
        deliveries: [...state.deliveries, ...latestDeliveries].slice(-MAX_RECORDED_DELIVERIES),
        latestDeliveries,
        result: complete
          ? `The ranger broadcast the final numbered change. All three hikers read ${total}.`
          : `The ranger stamped ${formatSigned(update.amount)}. ${queuedUpdates.length} ${queuedUpdates.length === 1 ? "note remains" : "notes remain"}.`,
      },
    };
  } catch (error) {
    return failure(state, "Sequencer delivery", error);
  }
}

export function deliverAllSharedOperations(
  state: SharedCounterDemoState,
): SharedCounterDemoResult {
  if (!state.view.pending) return failure(state, "Sequencer delivery", "send a change first");
  let next = state;
  while (next.view.pending) {
    const result = deliverNextSharedOperation(next);
    if (!result.ok) return result;
    next = result.state;
  }
  return { ok: true, state: next };
}

export function presentSharedCounterDemo(
  state: SharedCounterDemoState,
): SharedCounterDemoView {
  const normalize = (sequenceNumber: number) =>
    sequenceNumber - state.baselineSequence;
  const deliveries = state.deliveries.map((delivery) => ({
    ...delivery,
    sequenceNumber: normalize(delivery.sequenceNumber),
  }));
  return {
    phase: state.phase,
    replicas: state.view.replicas.map((replica) => ({
      ...replica,
      lastAppliedSequence: deliveries
        .filter(({ to }) => to === replica.id)
        .reduce((latest, delivery) => Math.max(latest, delivery.sequenceNumber), 0),
    })),
    queuedOperations: state.queuedUpdates.length,
    sequenceNumber: normalize(state.view.sequenceNumber),
    operations: state.operations.map((operation) => ({
      ...operation,
      sequenceNumber: normalize(operation.sequenceNumber),
    })),
    deliveries,
    latestDeliveries: state.latestDeliveries.map((delivery) => ({
      ...delivery,
      sequenceNumber: normalize(delivery.sequenceNumber),
    })),
    result: state.result,
    canDeliver: state.view.pending,
  };
}

export function formatSigned(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

export function isSharedReplicaId(value: string): value is ReplicaId {
  return REPLICA_IDS.includes(value as ReplicaId);
}
