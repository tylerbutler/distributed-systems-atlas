import {
  createGCounterRoom,
  deliverGCounterRace,
  incrementGCounterRoom,
  resendGCounterComponent,
  stageGCounterRace,
  type GCounterRoom,
  type GCounterRoomView,
  type Result,
  type TransportDelivery,
} from "@atlas/toolkit";

export type ReplicaId = "A" | "B" | "C";
export type GCounterDemoPhase = "initial" | "queued" | "delivered" | "resent";
type Counts = Record<ReplicaId, number>;

export type GCounterDemoState = {
  phase: GCounterDemoPhase;
  room: GCounterRoom;
  view: GCounterRoomView;
  deliveries: TransportDelivery[];
  latestDeliveries: TransportDelivery[];
  baselineSequence: number;
  authoredCounts: Counts;
  deliveredCounts: Counts;
  queuedOperations: number;
  latestAuthor: ReplicaId | null;
  result: string;
};

export type GCounterDemoView = {
  phase: GCounterDemoPhase;
  replicas: Array<{
    id: ReplicaId;
    value: number;
    counts: Array<{ replicaId: ReplicaId; count: number }>;
  }>;
  pending: boolean;
  queuedOperations: number;
  sequenceNumber: number;
  deliveries: TransportDelivery[];
  latestDeliveries: TransportDelivery[];
  result: string;
  canDeliver: boolean;
  canResend: boolean;
  latestAuthor: ReplicaId | null;
};

export type GCounterDemoResult =
  | { ok: true; state: GCounterDemoState }
  | { ok: false; state: GCounterDemoState; error: string };

const zeroCounts = (): Counts => ({ A: 0, B: 0, C: 0 });

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

export function createGCounterDemo(): GCounterDemoState {
  const created = value(createGCounterRoom());
  return {
    phase: "initial",
    room: created.room,
    view: created.view,
    deliveries: [],
    latestDeliveries: [],
    baselineSequence: created.view.sequenceNumber,
    authoredCounts: zeroCounts(),
    deliveredCounts: zeroCounts(),
    queuedOperations: 0,
    latestAuthor: null,
    result: "Play the authored race to send concurrent increments through Sluice.",
  };
}

function failure(state: GCounterDemoState, action: string, error: unknown): GCounterDemoResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    state,
    error: `${action} was not completed: ${message}. The last valid values are unchanged.`,
  };
}

export function incrementReplica(
  state: GCounterDemoState,
  replica: ReplicaId,
  amount: number,
): GCounterDemoResult {
  try {
    const incremented = value(incrementGCounterRoom(state.room, replica, amount));
    const authoredCounts = { ...state.authoredCounts, [replica]: state.authoredCounts[replica] + amount };
    const queuedOperations = state.queuedOperations + 1;
    return {
      ok: true,
      state: {
        ...state,
        phase: "queued",
        ...incremented,
        deliveries: state.deliveries,
        latestDeliveries: [],
        authoredCounts,
        queuedOperations,
        latestAuthor: replica,
        result: `${replica} added ${amount}. ${queuedOperations} ${queuedOperations === 1 ? "operation is" : "operations are"} waiting in Sluice.`,
      },
    };
  } catch (error) {
    return failure(state, `${replica} increment`, error);
  }
}

export function stageRace(state: GCounterDemoState): GCounterDemoResult {
  try {
    const staged = value(stageGCounterRace(state.room));
    return {
      ok: true,
      state: {
        ...state,
        phase: "queued",
        ...staged,
        deliveries: state.deliveries,
        latestDeliveries: [],
        authoredCounts: {
          ...state.authoredCounts,
          A: state.authoredCounts.A + 7,
          B: state.authoredCounts.B + 3,
        },
        queuedOperations: state.queuedOperations + 2,
        latestAuthor: "B",
        result: "A added 7 and B added 3. Their operations are waiting together in Sluice.",
      },
    };
  } catch (error) {
    return failure(state, "Concurrent increments", error);
  }
}

export function deliverRace(state: GCounterDemoState): GCounterDemoResult {
  if (!state.view.pending) {
    return failure(state, "Sluice delivery", "add an increment first");
  }
  try {
    const delivered = value(deliverGCounterRace(state.room));
    const total = delivered.view.replicas[0]?.value ?? 0;
    const operations = state.queuedOperations;
    return {
      ok: true,
      state: {
        ...state,
        phase: "delivered",
        ...delivered,
        deliveries: [...state.deliveries, ...delivered.deliveries].slice(-12),
        latestDeliveries: delivered.deliveries,
        deliveredCounts: { ...state.authoredCounts },
        queuedOperations: 0,
        result: `Sluice delivered ${operations} ${operations === 1 ? "operation" : "operations"}. All three clients read ${total}.`,
      },
    };
  } catch (error) {
    return failure(state, "Sluice delivery", error);
  }
}

export function resendComponent(state: GCounterDemoState): GCounterDemoResult {
  if (state.view.pending) {
    return failure(state, "Component resend", "deliver the queued operations first");
  }
  if (state.latestAuthor === null) {
    return failure(state, "Component resend", "add and deliver an increment first");
  }
  try {
    const resent = value(resendGCounterComponent(state.room, state.latestAuthor));
    const total = resent.view.replicas[0]?.value ?? 0;
    return {
      ok: true,
      state: {
        ...state,
        phase: "resent",
        ...resent,
        deliveries: [...state.deliveries, ...resent.deliveries].slice(-12),
        latestDeliveries: resent.deliveries,
        result: `Sluice resent ${state.latestAuthor}'s component. All three clients still read ${total}.`,
      },
    };
  } catch (error) {
    return failure(state, "Component resend", error);
  }
}

function componentCounts(
  state: GCounterDemoState,
  replica: ReplicaId,
): Array<{ replicaId: ReplicaId; count: number }> {
  return (["A", "B", "C"] as const).map((author) => ({
    replicaId: author,
    count: author === replica ? state.authoredCounts[author] : state.deliveredCounts[author],
  }));
}

export function presentGCounterDemo(state: GCounterDemoState): GCounterDemoView {
  return {
    phase: state.phase,
    replicas: state.view.replicas.map((replica) => ({
      ...replica,
      counts: componentCounts(state, replica.id),
    })),
    pending: state.view.pending,
    queuedOperations: state.queuedOperations,
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
    canResend: !state.view.pending && state.latestAuthor !== null,
    latestAuthor: state.latestAuthor,
  };
}
