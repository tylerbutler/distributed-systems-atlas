import {
  createPNCounterRoom,
  deliverPNCounterOperations,
  stagePNCounterRace,
  updatePNCounterRoom,
  type PNCounterRoom,
  type PNCounterRoomView,
  type PNCounterTransportResult,
  type Result,
  type TransportDelivery,
} from "@atlas/toolkit";

export type ReplicaId = "A" | "B" | "C";
export type PNCounterDemoPhase = "initial" | "queued" | "delivered";
export type PNCounterComponent = {
  replicaId: string;
  count: number;
};
export type PNCounterDelivery = TransportDelivery & {
  amount: number;
};

type Counts = Record<ReplicaId, number>;
type QueuedUpdate = {
  author: ReplicaId;
  amount: number;
};

const REPLICA_IDS: readonly ReplicaId[] = ["A", "B", "C"];
const STARTING_COUNT_ID = "starting-count";
const STARTING_COUNT = 10;
const MAX_RECORDED_DELIVERIES = 36;
const USER_NAMES: Record<ReplicaId, string> = {
  A: "Alice",
  B: "Bob",
  C: "Carol",
};

export type PNCounterDemoState = {
  phase: PNCounterDemoPhase;
  room: PNCounterRoom;
  view: PNCounterRoomView;
  deliveries: PNCounterDelivery[];
  latestDeliveries: PNCounterDelivery[];
  baselineSequence: number;
  authoredPositive: Counts;
  authoredNegative: Counts;
  deliveredPositive: Counts;
  deliveredNegative: Counts;
  queuedUpdates: QueuedUpdate[];
  result: string;
};

export type PNCounterDemoView = {
  phase: PNCounterDemoPhase;
  replicas: Array<{
    id: ReplicaId;
    value: number;
    positive: PNCounterComponent[];
    negative: PNCounterComponent[];
  }>;
  queuedOperations: number;
  deliveries: PNCounterDelivery[];
  latestDeliveries: PNCounterDelivery[];
  sequenceNumber: number;
  result: string;
  canDeliver: boolean;
};

export type PNCounterDemoResult =
  | { ok: true; state: PNCounterDemoState }
  | { ok: false; state: PNCounterDemoState; error: string };

const zeroCounts = (): Counts => ({ A: 0, B: 0, C: 0 });

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

export function pnCounterUserName(replica: ReplicaId): string {
  return USER_NAMES[replica];
}

export function createPNCounterDemo(): PNCounterDemoState {
  const created = value(createPNCounterRoom());
  return {
    phase: "initial",
    room: created.room,
    view: created.view,
    deliveries: [],
    latestDeliveries: [],
    baselineSequence: created.view.sequenceNumber,
    authoredPositive: zeroCounts(),
    authoredNegative: zeroCounts(),
    deliveredPositive: zeroCounts(),
    deliveredNegative: zeroCounts(),
    queuedUpdates: [],
    result: "Run the correction race, or record new birds and corrections for any hiker.",
  };
}

function failure(
  state: PNCounterDemoState,
  action: string,
  error: unknown,
): PNCounterDemoResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    state,
    error: `${action} was not completed: ${message}. The last valid values are unchanged.`,
  };
}

function recordUpdate(
  state: PNCounterDemoState,
  replica: ReplicaId,
  amount: number,
  roomUpdate: PNCounterTransportResult,
): PNCounterDemoState {
  const positive = amount > 0
    ? { ...state.authoredPositive, [replica]: state.authoredPositive[replica] + amount }
    : state.authoredPositive;
  const negative = amount < 0
    ? { ...state.authoredNegative, [replica]: state.authoredNegative[replica] + Math.abs(amount) }
    : state.authoredNegative;
  return {
    ...state,
    phase: "queued",
    ...roomUpdate,
    deliveries: state.deliveries,
    latestDeliveries: [],
    authoredPositive: positive,
    authoredNegative: negative,
    queuedUpdates: [...state.queuedUpdates, { author: replica, amount }],
  };
}

export function updatePNReplica(
  state: PNCounterDemoState,
  replica: ReplicaId,
  amount: number,
): PNCounterDemoResult {
  if (amount === 0) {
    return failure(
      state,
      `${pnCounterUserName(replica)} bird count`,
      "record a nonzero change",
    );
  }
  try {
    const updated = value(updatePNCounterRoom(state.room, replica, amount));
    const next = recordUpdate(state, replica, amount, updated);
    const magnitude = Math.abs(amount);
    return {
      ok: true,
      state: {
        ...next,
        result: amount > 0
          ? `${pnCounterUserName(replica)} recorded ${magnitude} more ${magnitude === 1 ? "bird" : "birds"}. ${next.queuedUpdates.length} checkpoint ${next.queuedUpdates.length === 1 ? "note is" : "notes are"} waiting.`
          : `${pnCounterUserName(replica)} corrected ${magnitude} duplicate ${magnitude === 1 ? "sighting" : "sightings"}. ${next.queuedUpdates.length} checkpoint ${next.queuedUpdates.length === 1 ? "note is" : "notes are"} waiting.`,
      },
    };
  } catch (error) {
    return failure(state, `${pnCounterUserName(replica)} bird count`, error);
  }
}

export function stageCorrectionRace(state: PNCounterDemoState): PNCounterDemoResult {
  try {
    const staged = value(stagePNCounterRace(state.room));
    return {
      ok: true,
      state: {
        ...recordUpdate(
          recordUpdate(state, "A", 3, staged),
          "B",
          -1,
          staged,
        ),
        result: "Alice recorded 3 more birds while Bob corrected 1 duplicate sighting. Two checkpoint notes are waiting.",
      },
    };
  } catch (error) {
    return failure(state, "Concurrent bird correction", error);
  }
}

function signedDeliveries(
  state: PNCounterDemoState,
  deliveries: TransportDelivery[],
): PNCounterDelivery[] {
  const updates = new Map<number, QueuedUpdate>();
  const sequenceNumbers = [...new Set(deliveries.map(({ sequenceNumber }) => sequenceNumber))]
    .sort((a, b) => a - b);
  sequenceNumbers.forEach((sequenceNumber, index) => {
    const update = state.queuedUpdates[index];
    if (update) updates.set(sequenceNumber, update);
  });
  return deliveries.flatMap((delivery) => {
    const update = updates.get(delivery.sequenceNumber);
    return update ? [{ ...delivery, amount: update.amount }] : [];
  });
}

export function deliverPNOperations(state: PNCounterDemoState): PNCounterDemoResult {
  if (!state.view.pending) {
    return failure(state, "Checkpoint delivery", "record a change first");
  }
  try {
    const delivered = value(deliverPNCounterOperations(state.room));
    const latestDeliveries = signedDeliveries(state, delivered.deliveries);
    const total = delivered.view.replicas[0]?.value ?? 0;
    const operations = state.queuedUpdates.length;
    const deliverySubject = operations === 1
      ? "The checkpoint note"
      : operations === 2
        ? "Both checkpoint notes"
        : `${operations} checkpoint notes`;
    return {
      ok: true,
      state: {
        ...state,
        phase: "delivered",
        ...delivered,
        deliveries: [...state.deliveries, ...latestDeliveries].slice(-MAX_RECORDED_DELIVERIES),
        latestDeliveries,
        deliveredPositive: { ...state.authoredPositive },
        deliveredNegative: { ...state.authoredNegative },
        queuedUpdates: [],
        result: `${deliverySubject} reached every hiker. All three read ${total} birds.`,
      },
    };
  } catch (error) {
    return failure(state, "Checkpoint delivery", error);
  }
}

function components(
  state: PNCounterDemoState,
  replica: ReplicaId,
  authored: Counts,
  delivered: Counts,
  includeBaseline: boolean,
): PNCounterComponent[] {
  return [
    ...(includeBaseline ? [{ replicaId: STARTING_COUNT_ID, count: STARTING_COUNT }] : []),
    ...REPLICA_IDS.map((author) => ({
      replicaId: author,
      count: author === replica ? authored[author] : delivered[author],
    })).filter(({ count }) => count > 0),
  ];
}

export function presentPNCounterDemo(state: PNCounterDemoState): PNCounterDemoView {
  return {
    phase: state.phase,
    replicas: state.view.replicas.map((replica) => ({
      ...replica,
      positive: components(
        state,
        replica.id,
        state.authoredPositive,
        state.deliveredPositive,
        true,
      ),
      negative: components(
        state,
        replica.id,
        state.authoredNegative,
        state.deliveredNegative,
        false,
      ),
    })),
    queuedOperations: state.queuedUpdates.length,
    sequenceNumber: state.view.sequenceNumber - state.baselineSequence,
    deliveries: state.deliveries.map((delivery) => ({
      ...delivery,
      sequenceNumber: delivery.sequenceNumber - state.baselineSequence,
    })),
    latestDeliveries: state.latestDeliveries.map((delivery) => ({
      ...delivery,
      sequenceNumber: delivery.sequenceNumber - state.baselineSequence,
    })),
    result: state.result,
    canDeliver: state.view.pending,
  };
}

export function pnCounterComponentCount(
  components: PNCounterComponent[],
  replicaId: string,
): number {
  return components.find((component) => component.replicaId === replicaId)?.count ?? 0;
}

export const pnCounterComponentIds = [
  STARTING_COUNT_ID,
  ...REPLICA_IDS,
] as const;
