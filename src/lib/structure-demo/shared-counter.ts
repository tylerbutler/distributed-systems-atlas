import {
  createSharedCounterRoom,
  createSharedCounter,
  inspectSharedCounter,
  incrementSharedCounter,
  applySharedCounterOperation,
  acknowledgeSharedCounter,
  rollbackSharedCounter,
  deliverOneSharedCounterOperation,
  stageSharedCounterRace,
  updateSharedCounterRoom,
  type Result,
  type SharedCounterRoom,
  type SharedCounter,
  type SharedCounterRoomView,
  type TransportDelivery,
} from "@atlas/toolkit";
import {
  demoReplicaName,
  REPLICA_IDS as DEMO_REPLICA_IDS,
  type DemoReplicaId,
} from "./replicas";
import {
  isSequencedCounterOperation,
  isSharedAmount,
  MAX_SHARED_OPERATIONS,
  SHARED_COUNTER_INITIAL,
  type SequencedCounterOperation,
} from "../../../worker/shared-counter-protocol";

export type ReplicaId = DemoReplicaId;
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

const REPLICA_IDS: readonly ReplicaId[] = DEMO_REPLICA_IDS;
const MAX_RECORDED_DELIVERIES = 36;
const MAX_RECORDED_OPERATIONS = 12;
type SharedCounterBase = {
  phase: SharedCounterDemoPhase;
  view: SharedCounterRoomView;
  baselineSequence: number;
  queuedUpdates: QueuedUpdate[];
  operations: SharedCounterOperation[];
  deliveries: SharedCounterDelivery[];
  latestDeliveries: SharedCounterDelivery[];
  result: string;
};
type PendingChange = QueuedUpdate & { id: string; messageId: number };
export type SharedCounterDemoState = SharedCounterBase & (
  | { mode: "local"; room: SharedCounterRoom }
  | { mode: "live"; live: {
    replicas: Record<ReplicaId, SharedCounter>;
    pending: PendingChange[];
    incoming: SequencedCounterOperation[];
    appliedSequence: number;
  } }
);
type LocalState = Extract<SharedCounterDemoState, { mode: "local" }>;
type LiveState = Extract<SharedCounterDemoState, { mode: "live" }>;

export type SharedCounterDemoView = {
  phase: SharedCounterDemoPhase;
  replicas: Array<{
    id: ReplicaId;
    value: number;
    lastAppliedSequence: number;
    optimistic: boolean;
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
  return demoReplicaName(replica);
}

export function createSharedCounterDemo(): SharedCounterDemoState {
  const created = value(createSharedCounterRoom());
  return { ...initialState(created.view), mode: "local", room: created.room };
}

function initialState(view: SharedCounterRoomView): SharedCounterBase {
  return {
    phase: "initial",
    view,
    baselineSequence: view.sequenceNumber,
    queuedUpdates: [],
    operations: [],
    deliveries: [],
    latestDeliveries: [],
    result: "Send a signed change, or race Alice's count against Bob's correction.",
  };
}

function liveView(replicas: LiveState["live"]["replicas"], sequenceNumber: number): SharedCounterRoomView {
  const inspected = REPLICA_IDS.map((id) => ({ id, ...value(inspectSharedCounter(replicas[id])) }));
  return {
    replicas: inspected.map(({ id, value }) => ({ id, value })),
    pending: inspected.some(({ pending }) => pending > 0),
    sequenceNumber,
  };
}

export function createLiveSharedCounterDemo(
  history: readonly SequencedCounterOperation[] = [],
): SharedCounterDemoState {
  const replicas = {
    A: value(createSharedCounter(SHARED_COUNTER_INITIAL)),
    B: value(createSharedCounter(SHARED_COUNTER_INITIAL)),
    C: value(createSharedCounter(SHARED_COUNTER_INITIAL)),
  };
  let state: SharedCounterDemoState = {
    ...initialState(liveView(replicas, 0)),
    mode: "live",
    live: { replicas, pending: [], incoming: [], appliedSequence: 0 },
    result: "Send a signed change from this device's assigned hiker.",
  };
  for (const operation of history) {
    const received = receiveSharedCounterOperation(state, operation);
    if (!received.ok) throw new Error(received.error);
    const delivered = deliverNextSharedOperation(received.state);
    if (!delivered.ok) throw new Error(delivered.error);
    state = delivered.state;
  }
  return {
    ...state,
    latestDeliveries: [],
    result: `Loaded ${history.length} stored operations. All three hikers read ${state.view.replicas[0].value}.`,
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
  state: LocalState,
  update: QueuedUpdate,
  roomUpdate: Pick<LocalState, "room" | "view">,
): LocalState {
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
    if (state.mode === "live") {
      if (!isSharedAmount(amount)) throw new Error("the signed amount is outside the room's numeric range");
      if (state.live.pending.length >= MAX_SHARED_OPERATIONS || state.view.sequenceNumber >= MAX_SHARED_OPERATIONS) {
        throw new Error("this demo room has reached its operation limit; wait for confirmation or reset");
      }
      const changed = value(incrementSharedCounter(state.live.replicas[replica], amount));
      const replicas = { ...state.live.replicas, [replica]: changed.state };
      const pending = [...state.live.pending, {
        id: crypto.randomUUID(), author: replica, amount: changed.amount, messageId: changed.messageId,
      }];
      return { ok: true, state: {
        ...state, phase: "queued", view: liveView(replicas, state.view.sequenceNumber),
        live: { ...state.live, replicas, pending }, latestDeliveries: [],
        result: `${sharedCounterUserName(replica)} applied ${formatSigned(amount)} locally. Waiting for a sequence number.`,
      } };
    }
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
    if (state.mode === "live") throw new Error("send each hiker's change from their own device");
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
  if (state.mode === "live") return deliverLiveOperation(state);
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
  if (!presentSharedCounterDemo(state).canDeliver) return failure(state, "Sequencer delivery", "send a change first");
  let next = state;
  while (presentSharedCounterDemo(next).canDeliver) {
    const result = deliverNextSharedOperation(next);
    if (!result.ok) return result;
    next = result.state;
  }
  return { ok: true, state: next };
}

export function receiveSharedCounterOperation(
  state: SharedCounterDemoState, operation: SequencedCounterOperation,
): SharedCounterDemoResult {
  if (state.mode !== "live") return failure(state, "Room delivery", "join a live room first");
  if (!isSequencedCounterOperation(operation)) return failure(state, "Room delivery", "invalid signed operation");
  if (operation.sequenceNumber <= state.view.sequenceNumber) return { ok: true, state };
  if (operation.sequenceNumber !== state.view.sequenceNumber + 1) {
    return failure(state, "Room delivery", "recover the missing sequence numbers first");
  }
  return { ok: true, state: {
    ...state, phase: "queued",
    view: { ...state.view, sequenceNumber: operation.sequenceNumber },
    live: { ...state.live, incoming: [...state.live.incoming, operation] },
    operations: [...state.operations, operation].slice(-MAX_RECORDED_OPERATIONS),
    latestDeliveries: [],
    result: `The Durable Object assigned SN ${operation.sequenceNumber} to ${sharedCounterUserName(operation.author)} ${formatSigned(operation.amount)}.`,
  } };
}

function deliverLiveOperation(state: LiveState): SharedCounterDemoResult {
  const operation = state.live.incoming[0];
  if (!operation) return failure(state, "Room delivery", "wait for a numbered operation");
  try {
    if (operation.sequenceNumber !== state.live.appliedSequence + 1) throw new Error("a sequence number is missing");
    const local = state.live.pending.find(({ id }) => id === operation.id);
    if (local && (local.author !== operation.author || local.amount !== operation.amount)) {
      throw new Error("the sequencer's acknowledgement did not match the local operation");
    }
    const replicas = { ...state.live.replicas };
    for (const id of REPLICA_IDS) {
      replicas[id] = value(local && id === local.author
        ? acknowledgeSharedCounter(replicas[id], operation.amount, local.messageId)
        : applySharedCounterOperation(replicas[id], operation.amount));
    }
    const pending = state.live.pending.filter(({ id }) => id !== operation.id);
    const incoming = state.live.incoming.slice(1);
    const latestDeliveries = REPLICA_IDS.map((to) => ({
      to, event: local && to === local.author ? "acknowledged" : "applied",
      author: operation.author, amount: operation.amount, sequenceNumber: operation.sequenceNumber,
    }));
    const view = liveView(replicas, state.view.sequenceNumber);
    const complete = incoming.length === 0 && pending.length === 0;
    return { ok: true, state: {
      ...state, phase: complete ? "delivered" : "queued", view,
      live: { replicas, pending, incoming, appliedSequence: operation.sequenceNumber },
      deliveries: [...state.deliveries, ...latestDeliveries].slice(-MAX_RECORDED_DELIVERIES),
      latestDeliveries,
      result: complete
        ? `Applied through SN ${operation.sequenceNumber}. All three hikers read ${view.replicas[0].value}.`
        : `Applied SN ${operation.sequenceNumber}. Other numbered or unconfirmed changes remain.`,
    } };
  } catch (error) {
    return failure(state, "Room delivery", error);
  }
}

export function rollbackSharedChanges(
  state: SharedCounterDemoState, all = false,
): SharedCounterDemoResult {
  if (state.mode !== "live") return failure(state, "Rollback", "join a live room first");
  try {
    const replicas = { ...state.live.replicas };
    const pending = [...state.live.pending];
    do {
      const change = pending.pop();
      if (!change) break;
      replicas[change.author] = value(rollbackSharedCounter(
        replicas[change.author], change.amount, change.messageId,
      ));
    } while (all);
    return { ok: true, state: {
      ...state, view: liveView(replicas, state.view.sequenceNumber),
      live: { ...state.live, replicas, pending },
      result: "Unconfirmed local changes were rolled back.",
    } };
  } catch (error) {
    return failure(state, "Rollback", error);
  }
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
      optimistic: state.mode === "live"
        ? value(inspectSharedCounter(state.live.replicas[replica.id])).pending > 0
        : state.view.pending,
      lastAppliedSequence: state.mode === "live" ? state.live.appliedSequence : deliveries
        .filter(({ to }) => to === replica.id)
        .reduce((latest, delivery) => Math.max(latest, delivery.sequenceNumber), 0),
    })),
    queuedOperations: state.mode === "live"
      ? new Set([...state.live.pending, ...state.live.incoming].map(({ id }) => id)).size
      : state.queuedUpdates.length,
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
    canDeliver: state.mode === "live" ? state.live.incoming.length > 0 : state.view.pending,
  };
}

export function formatSigned(amount: number): string {
  return amount > 0 ? `+${amount}` : String(amount);
}

export function isSharedReplicaId(value: string): value is ReplicaId {
  return REPLICA_IDS.includes(value as ReplicaId);
}
