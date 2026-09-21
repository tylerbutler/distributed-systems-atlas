import {
  createGCounterRoom,
  deliverGCounterRace,
  resendGCounterComponent,
  stageGCounterRace,
  type GCounterRoom,
  type GCounterRoomView,
  type Result,
  type TransportDelivery,
} from "@atlas/toolkit";

export type GCounterDemoPhase = "initial" | "staged" | "delivered" | "resent";

export type GCounterDemoState = {
  phase: GCounterDemoPhase;
  room: GCounterRoom;
  view: GCounterRoomView;
  deliveries: TransportDelivery[];
  baselineSequence: number;
};

export type GCounterDemoView = {
  phase: GCounterDemoPhase;
  replicas: Array<{
    id: "A" | "B" | "C";
    value: number;
    counts: Array<{ replicaId: "A" | "B" | "C"; count: number }>;
  }>;
  pending: boolean;
  sequenceNumber: number;
  deliveries: TransportDelivery[];
  result: string;
  canStage: boolean;
  canDeliver: boolean;
  canResend: boolean;
};

export type GCounterDemoResult =
  | { ok: true; state: GCounterDemoState }
  | { ok: false; state: GCounterDemoState; error: string };

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
    baselineSequence: created.view.sequenceNumber,
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

export function stageRace(state: GCounterDemoState): GCounterDemoResult {
  if (state.phase !== "initial") {
    return failure(state, "Concurrent increments", "reset the demo before staging another race");
  }
  try {
    const staged = value(stageGCounterRace(state.room));
    return { ok: true, state: { phase: "staged", ...staged, baselineSequence: state.baselineSequence } };
  } catch (error) {
    return failure(state, "Concurrent increments", error);
  }
}

export function deliverRace(state: GCounterDemoState): GCounterDemoResult {
  if (state.phase !== "staged") {
    return failure(state, "Sluice delivery", "stage the concurrent increments first");
  }
  try {
    const delivered = value(deliverGCounterRace(state.room));
    return { ok: true, state: { phase: "delivered", ...delivered, baselineSequence: state.baselineSequence } };
  } catch (error) {
    return failure(state, "Sluice delivery", error);
  }
}

export function resendComponent(state: GCounterDemoState): GCounterDemoResult {
  if (state.phase !== "delivered" && state.phase !== "resent") {
    return failure(state, "Component resend", "deliver the race first");
  }
  try {
    const resent = value(resendGCounterComponent(state.room));
    return { ok: true, state: { phase: "resent", ...resent, baselineSequence: state.baselineSequence } };
  } catch (error) {
    return failure(state, "Component resend", error);
  }
}

function componentCounts(
  phase: GCounterDemoPhase,
  replica: "A" | "B" | "C",
): Array<{ replicaId: "A" | "B" | "C"; count: number }> {
  const converged = phase === "delivered" || phase === "resent";
  return [
    { replicaId: "A", count: converged || (phase === "staged" && replica === "A") ? 7 : 0 },
    { replicaId: "B", count: converged || (phase === "staged" && replica === "B") ? 3 : 0 },
    { replicaId: "C", count: 0 },
  ];
}

export function presentGCounterDemo(state: GCounterDemoState): GCounterDemoView {
  return {
    phase: state.phase,
    replicas: state.view.replicas.map((replica) => ({
      ...replica,
      counts: componentCounts(state.phase, replica.id),
    })),
    pending: state.view.pending,
    sequenceNumber: state.view.sequenceNumber - state.baselineSequence,
    deliveries: state.deliveries.map((delivery) => ({
      ...delivery,
      sequenceNumber: delivery.sequenceNumber - state.baselineSequence,
    })),
    result: state.phase === "initial"
      ? "All three replicas start at 0."
      : state.phase === "staged"
        ? "A reads 7, B reads 3, and C reads 0. Two operations are waiting in Sluice."
        : state.phase === "delivered"
          ? "Sluice delivered both operations. All three replicas read 10."
          : "Sluice resent B's component. All three replicas still read 10.",
    canStage: state.phase === "initial",
    canDeliver: state.phase === "staged",
    canResend: state.phase === "delivered" || state.phase === "resent",
  };
}
