import {
  createGCounterRoom,
  deliverGCounterRace,
  deliverOneGCounterOperation,
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
const MAX_RECORDED_DELIVERIES = 36;
const USER_NAMES: Record<ReplicaId, string> = {
  A: "Alice",
  B: "Bob",
  C: "Carol",
};

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

export function gCounterUserName(replica: ReplicaId): string {
  return USER_NAMES[replica];
}

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
    result: "Count birds with Alice, Bob, or Carol, or leave Alice's and Bob's checkpoint notes together.",
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
        result: `${gCounterUserName(replica)} counted ${amount} more ${amount === 1 ? "bird" : "birds"}. ${queuedOperations} checkpoint ${queuedOperations === 1 ? "note is" : "notes are"} queued for sharing.`,
      },
    };
  } catch (error) {
    return failure(state, `${gCounterUserName(replica)} bird count`, error);
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
        result: "Alice counted 7 birds and Bob counted 3. Their checkpoint notes are queued for sharing.",
      },
    };
  } catch (error) {
    return failure(state, "Concurrent bird counts", error);
  }
}

export function deliverRace(state: GCounterDemoState): GCounterDemoResult {
  if (!state.view.pending) {
    return failure(state, "Checkpoint delivery", "record a bird first");
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
        deliveries: [...state.deliveries, ...delivered.deliveries].slice(-MAX_RECORDED_DELIVERIES),
        latestDeliveries: delivered.deliveries,
        deliveredCounts: { ...state.authoredCounts },
        queuedOperations: 0,
        result: `${operations} checkpoint ${operations === 1 ? "note was" : "notes were"} delivered to every hiker. All three read ${total} birds.`,
      },
    };
  } catch (error) {
    return failure(state, "Checkpoint delivery", error);
  }
}

export function deliverNextOperation(state: GCounterDemoState): GCounterDemoResult {
  if (!state.view.pending) {
    return failure(state, "Checkpoint delivery", "record a bird first");
  }
  try {
    const delivered = value(deliverOneGCounterOperation(state.room));
    const queuedOperations = Math.max(0, state.queuedOperations - 1);
    const complete = queuedOperations === 0;
    const total = delivered.view.replicas[0]?.value ?? 0;
    return {
      ok: true,
      state: {
        ...state,
        phase: complete ? "delivered" : "queued",
        ...delivered,
        deliveries: [...state.deliveries, ...delivered.deliveries].slice(-MAX_RECORDED_DELIVERIES),
        latestDeliveries: delivered.deliveries,
        deliveredCounts: complete ? { ...state.authoredCounts } : state.deliveredCounts,
        queuedOperations,
        result: complete
          ? `The final checkpoint note was delivered to every hiker. All three read ${total} birds.`
          : `One checkpoint note was delivered to every hiker. ${queuedOperations} remain queued.`,
      },
    };
  } catch (error) {
    return failure(state, "Checkpoint delivery", error);
  }
}

export function resendUserCount(state: GCounterDemoState): GCounterDemoResult {
  if (state.view.pending) {
    return failure(state, "Note repeat", "share the queued checkpoint notes first");
  }
  if (state.latestAuthor === null) {
    return failure(state, "Note repeat", "record and share a bird count first");
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
        deliveries: [...state.deliveries, ...resent.deliveries].slice(-MAX_RECORDED_DELIVERIES),
        latestDeliveries: resent.deliveries,
        result: `${gCounterUserName(state.latestAuthor)} left the same checkpoint note again. All three hikers still read ${total} birds.`,
      },
    };
  } catch (error) {
    return failure(state, "Note repeat", error);
  }
}

function userCounts(
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
      counts: userCounts(state, replica.id),
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
