import {
  createMapRoom,
  deliverMapOperations,
  stageMapRace,
  updateMapRoom,
  type MapRoom,
  type MapRoomAction,
  type MapRoomKind,
  type MapRoomView,
  type Result,
  type TransportDelivery,
} from "@atlas/toolkit";

export type ReplicaId = "A" | "B" | "C";
export type MapKind = MapRoomKind;
export type MapOperation = {
  author: ReplicaId;
  action: MapRoomAction;
  key: string;
  value: string;
};
export type MapDelivery = TransportDelivery & MapOperation;

export type MapDemoState = {
  kind: MapKind;
  room: MapRoom;
  view: MapRoomView;
  queuedOperations: MapOperation[];
  deliveries: MapDelivery[];
  latestDeliveries: MapDelivery[];
  result: string;
};

export type MapDemoResult =
  | { ok: true; state: MapDemoState }
  | { ok: false; state: MapDemoState; error: string };

const USER_NAMES: Record<ReplicaId, string> = {
  A: "Alice",
  B: "Bob",
  C: "Carol",
};

const RACES: Record<MapKind, readonly MapOperation[]> = {
  "shared-map": [
    { author: "A", action: "set", key: "gate-status", value: "Trail open" },
    { author: "B", action: "set", key: "gate-status", value: "Trail closed" },
  ],
  "lww-map": [
    { author: "A", action: "set", key: "gate-status", value: "Trail open" },
    { author: "B", action: "set", key: "gate-status", value: "Trail closed" },
  ],
  "or-map": [
    { author: "A", action: "remove", key: "Eagle Creek", value: "" },
    { author: "B", action: "increment", key: "Eagle Creek", value: "3" },
  ],
  "shared-directory": [
    { author: "A", action: "mkdir", key: "eagle-creek", value: "" },
    { author: "B", action: "mkdir", key: "eagle-creek", value: "" },
  ],
};

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

export function mapUserName(replica: ReplicaId): string {
  return USER_NAMES[replica];
}

export function mapRaceOperations(kind: MapKind): readonly MapOperation[] {
  return RACES[kind];
}

function sharedMapResult(state: MapDemoState, view: MapRoomView): string {
  const operation = state.queuedOperations.at(-1);
  const entries = view.replicas[0]?.entries;
  if (!operation || !entries) throw new Error("Missing shared map result");
  const value = entries.find(({ key }) => key === operation.key)?.value;
  return `The ranger numbered ${mapUserName(operation.author)}'s ${operation.key} note last. Every hiker sees ${value ?? "no answer"} on that line.`;
}

export function createMapDemo(kind: MapKind): MapDemoState {
  const created = value(createMapRoom(kind));
  return {
    kind,
    room: created.room,
    view: created.view,
    queuedOperations: [],
    deliveries: [],
    latestDeliveries: [],
    result: kind === "or-map"
      ? "Eagle Creek starts with 5 supply crates. Race removal against a concurrent delivery."
      : kind === "shared-map"
        ? "Each notebook starts with gate and bridge reports. Race the gate edits or change a line yourself."
        : "Run the race, or let any hiker change their own notebook.",
  };
}

function failure(state: MapDemoState, action: string, error: unknown): MapDemoResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    state,
    error: `${action} was not completed: ${message}. The last valid map is unchanged.`,
  };
}

export function updateMapReplica(
  state: MapDemoState,
  operation: MapOperation,
): MapDemoResult {
  try {
    const updated = value(updateMapRoom(
      state.room,
      operation.author,
      operation.action,
      operation.key,
      operation.value,
    ));
    return {
      ok: true,
      state: {
        ...state,
        ...updated,
        deliveries: state.deliveries,
        latestDeliveries: [],
        queuedOperations: [...state.queuedOperations, operation],
        result: `${mapUserName(operation.author)} changed ${operation.key} in their notebook. The note is on its way.`,
      },
    };
  } catch (error) {
    return failure(state, `${mapUserName(operation.author)}'s map update`, error);
  }
}

export function stageMapDemoRace(state: MapDemoState): MapDemoResult {
  try {
    const staged = value(stageMapRace(state.room));
    return {
      ok: true,
      state: {
        ...state,
        ...staged,
        deliveries: state.deliveries,
        latestDeliveries: [],
        queuedOperations: [...RACES[state.kind]],
        result: state.kind === "or-map"
          ? "Alice crossed out the stockpile line while Bob logged 3 more crates."
          : state.kind === "shared-directory"
            ? "Alice and Bob concurrently created the same Eagle Creek folder."
            : state.kind === "shared-map"
              ? "Alice and Bob changed the gate-status line. The bridge-status line stays as it was."
              : "Alice wrote Trail open while Bob wrote Trail closed.",
      },
    };
  } catch (error) {
    return failure(state, "The authored map race", error);
  }
}

function labelDeliveries(
  operations: MapOperation[],
  deliveries: TransportDelivery[],
): MapDelivery[] {
  const bySequence = new Map<number, MapOperation>();
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

export function deliverMapDemoOperations(state: MapDemoState): MapDemoResult {
  if (!state.view.pending) {
    return failure(state, "Map delivery", "record an update first");
  }
  try {
    const delivered = value(deliverMapOperations(state.room));
    const latestDeliveries = labelDeliveries(state.queuedOperations, delivered.deliveries);
    const result = state.kind === "shared-map"
      ? sharedMapResult(state, delivered.view)
      : state.kind === "lww-map"
        ? "Bob's note has the later time. Every hiker reads Trail closed."
        : state.kind === "or-map"
          ? "Alice crossed out the old line. All three hikers keep Bob's new note and count 8 crates."
          : "Alice and Bob's two notes refer to one Eagle Creek folder.";
    return {
      ok: true,
      state: {
        ...state,
        ...delivered,
        deliveries: [...state.deliveries, ...latestDeliveries].slice(-36),
        latestDeliveries,
        queuedOperations: [],
        result,
      },
    };
  } catch (error) {
    return failure(state, "Map delivery", error);
  }
}
