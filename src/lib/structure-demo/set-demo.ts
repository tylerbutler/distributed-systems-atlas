import {
  createSetRoom,
  deliverSetOperations,
  stageSetRace,
  updateSetRoom,
  type Result,
  type SetRoom,
  type SetRoomAction,
  type SetRoomKind,
  type SetRoomView,
  type SetTransportResult,
  type TransportDelivery,
} from "@atlas/toolkit";

export type ReplicaId = "A" | "B" | "C";
export type SetDemoKind = SetRoomKind;
export type SetDemoPhase = "initial" | "queued" | "delivered";
export type SetDemoOperation = {
  author: ReplicaId;
  action: SetRoomAction;
  element: string;
};
export type SetDemoDelivery = TransportDelivery & SetDemoOperation;

export type SetDemoState = {
  kind: SetDemoKind;
  phase: SetDemoPhase;
  room: SetRoom;
  view: SetRoomView;
  queuedOperations: SetDemoOperation[];
  deliveries: SetDemoDelivery[];
  latestDeliveries: SetDemoDelivery[];
  result: string;
};

export type SetDemoView = {
  kind: SetDemoKind;
  phase: SetDemoPhase;
  replicas: SetRoomView["replicas"];
  queuedOperations: number;
  deliveries: SetDemoDelivery[];
  latestDeliveries: SetDemoDelivery[];
  canDeliver: boolean;
  result: string;
};

export type SetDemoResult =
  | { ok: true; state: SetDemoState }
  | { ok: false; state: SetDemoState; error: string };

const USER_NAMES: Record<ReplicaId, string> = {
  A: "Alice",
  B: "Bob",
  C: "Carol",
};

const RACE_OPERATIONS: Record<SetDemoKind, SetDemoOperation[]> = {
  "g-set": [
    { author: "A", action: "add", element: "Eagle Creek" },
    { author: "B", action: "add", element: "Ridge Pass" },
  ],
  "two-p-set": [
    { author: "A", action: "remove", element: "Eagle Creek" },
    { author: "B", action: "add", element: "Eagle Creek" },
  ],
  "or-set": [
    { author: "A", action: "remove", element: "Eagle Creek" },
    { author: "B", action: "add", element: "Eagle Creek" },
  ],
};

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

function initialResult(kind: SetDemoKind): string {
  if (kind === "g-set") {
    return "Run the survey race, or let any hiker report a beacon.";
  }
  return kind === "two-p-set"
    ? "Eagle Creek is active. Race Alice's retirement against Bob's replacement report."
    : "The old Eagle Creek installation is active. Race its removal against Bob's replacement.";
}

export function setDemoUserName(replica: ReplicaId): string {
  return USER_NAMES[replica];
}

export function createSetDemo(kind: SetDemoKind): SetDemoState {
  const created = value(createSetRoom(kind));
  return {
    kind,
    phase: "initial",
    room: created.room,
    view: created.view,
    queuedOperations: [],
    deliveries: [],
    latestDeliveries: [],
    result: initialResult(kind),
  };
}

function failure(state: SetDemoState, action: string, error: unknown): SetDemoResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    state,
    error: `${action} was not completed: ${message}. The last valid set is unchanged.`,
  };
}

function record(
  state: SetDemoState,
  operation: SetDemoOperation,
  updated: SetTransportResult,
): SetDemoState {
  return {
    ...state,
    phase: "queued",
    ...updated,
    deliveries: state.deliveries,
    latestDeliveries: [],
    queuedOperations: [...state.queuedOperations, operation],
  };
}

export function updateSetReplica(
  state: SetDemoState,
  operation: SetDemoOperation,
): SetDemoResult {
  try {
    const updated = value(updateSetRoom(
      state.room,
      operation.author,
      operation.action,
      operation.element,
    ));
    return {
      ok: true,
      state: {
        ...record(state, operation, updated),
        result: `${setDemoUserName(operation.author)} ${
          operation.action === "add" ? "reported" : "retired"
        } ${operation.element}. The record is traveling.`,
      },
    };
  } catch (error) {
    return failure(state, `${setDemoUserName(operation.author)}'s update`, error);
  }
}

export function stageSetDemoRace(state: SetDemoState): SetDemoResult {
  try {
    const staged = value(stageSetRace(state.room));
    return {
      ok: true,
      state: {
        ...state,
        phase: "queued",
        ...staged,
        deliveries: state.deliveries,
        latestDeliveries: [],
        queuedOperations: RACE_OPERATIONS[state.kind],
        result: state.kind === "g-set"
          ? "Alice and Bob reported different beacons. Both records are traveling."
          : state.kind === "two-p-set"
            ? "Alice retired Eagle Creek while Bob reported it again. The records are traveling."
            : "Alice removed the old installation while Bob reported a fresh replacement. The records are traveling.",
      },
    };
  } catch (error) {
    return failure(state, "The authored set race", error);
  }
}

function labelDeliveries(
  operations: SetDemoOperation[],
  deliveries: TransportDelivery[],
): SetDemoDelivery[] {
  const bySequence = new Map<number, SetDemoOperation>();
  [...new Set(deliveries.map(({ sequenceNumber }) => sequenceNumber))]
    .sort((a, b) => a - b)
    .forEach((sequenceNumber, index) => {
      const operation = operations[index];
      if (operation) bySequence.set(sequenceNumber, operation);
    });
  return deliveries.flatMap((delivery) => {
    const operation = bySequence.get(delivery.sequenceNumber);
    return operation ? [{ ...delivery, ...operation }] : [];
  });
}

export function deliverSetDemoOperations(state: SetDemoState): SetDemoResult {
  if (!state.view.pending) {
    return failure(state, "Record delivery", "record a change first");
  }
  try {
    const delivered = value(deliverSetOperations(state.room));
    const latestDeliveries = labelDeliveries(state.queuedOperations, delivered.deliveries);
    const values = delivered.view.replicas[0]?.values ?? [];
    const result = state.kind === "g-set"
      ? `The reports reached every hiker. The union contains ${values.join(" and ")}.`
      : state.kind === "two-p-set"
        ? "The retirement tombstone reached every hiker. Eagle Creek stays absent."
        : "Both records reached every hiker. Bob's fresh Eagle Creek installation survives.";
    return {
      ok: true,
      state: {
        ...state,
        phase: "delivered",
        ...delivered,
        deliveries: [...state.deliveries, ...latestDeliveries].slice(-36),
        latestDeliveries,
        queuedOperations: [],
        result,
      },
    };
  } catch (error) {
    return failure(state, "Record delivery", error);
  }
}

export function presentSetDemo(state: SetDemoState): SetDemoView {
  return {
    kind: state.kind,
    phase: state.phase,
    replicas: state.view.replicas,
    queuedOperations: state.queuedOperations.length,
    deliveries: state.deliveries,
    latestDeliveries: state.latestDeliveries,
    canDeliver: state.view.pending,
    result: state.result,
  };
}
