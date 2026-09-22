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
  tag?: string;
  observedTags?: string[];
};
export type SetDemoDelivery = TransportDelivery & SetDemoOperation;
export type OrSetNotebook = {
  additions: Array<{ element: string; tag: string }>;
  removals: Array<{ element: string; tag: string }>;
  highestTagNumber: number;
};

export type SetDemoState = {
  kind: SetDemoKind;
  phase: SetDemoPhase;
  room: SetRoom;
  view: SetRoomView;
  queuedOperations: SetDemoOperation[];
  deliveries: SetDemoDelivery[];
  latestDeliveries: SetDemoDelivery[];
  orSetNotebooks?: Record<ReplicaId, OrSetNotebook>;
  result: string;
};

export type SetDemoView = {
  kind: SetDemoKind;
  phase: SetDemoPhase;
  replicas: SetRoomView["replicas"];
  queuedOperations: number;
  deliveries: SetDemoDelivery[];
  latestDeliveries: SetDemoDelivery[];
  orSetNotebooks?: Record<ReplicaId, OrSetNotebook>;
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
  const initialNotebook = (): OrSetNotebook => ({
    additions: [{ element: "Eagle Creek", tag: "A:1" }],
    removals: [],
    highestTagNumber: 1,
  });
  return {
    kind,
    phase: "initial",
    room: created.room,
    view: created.view,
    queuedOperations: [],
    deliveries: [],
    latestDeliveries: [],
    orSetNotebooks: kind === "or-set"
      ? { A: initialNotebook(), B: initialNotebook(), C: initialNotebook() }
      : undefined,
    result: initialResult(kind),
  };
}

function prepareOperation(
  state: SetDemoState,
  operation: SetDemoOperation,
): SetDemoOperation {
  if (state.kind !== "or-set" || !state.orSetNotebooks) return operation;
  const notebook = state.orSetNotebooks[operation.author];
  if (operation.action === "add") {
    const number = notebook.highestTagNumber + 1;
    return { ...operation, tag: `${operation.author}:${number}` };
  }
  return {
    ...operation,
    observedTags: notebook.additions
      .filter(({ element }) => element === operation.element)
      .map(({ tag }) => tag),
  };
}

function applyLocalNotebook(
  notebooks: Record<ReplicaId, OrSetNotebook>,
  operation: SetDemoOperation,
): Record<ReplicaId, OrSetNotebook> {
  const notebook = notebooks[operation.author];
  const additions = operation.action === "add"
    ? [...notebook.additions, {
      element: operation.element,
      tag: operation.tag ?? "",
    }]
    : notebook.additions.filter(({ tag }) =>
      !operation.observedTags?.includes(tag));
  const removed = operation.action === "remove"
    ? notebook.additions.filter(({ tag }) => operation.observedTags?.includes(tag))
    : [];
  return {
    ...notebooks,
    [operation.author]: {
      additions,
      removals: [...notebook.removals, ...removed],
      highestTagNumber: operation.tag
        ? Math.max(
          notebook.highestTagNumber,
          Number(operation.tag.split(":")[1]),
        )
        : notebook.highestTagNumber,
    },
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
    operation = prepareOperation(state, operation);
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
        orSetNotebooks: state.orSetNotebooks
          ? applyLocalNotebook(state.orSetNotebooks, operation)
          : undefined,
        result: `${setDemoUserName(operation.author)} ${
          operation.action === "add" ? "reported" : "retired"
        } ${operation.element}${
          operation.tag ? ` as ${operation.tag}` : ""
        }. The record is in transit.`,
      },
    };
  } catch (error) {
    return failure(state, `${setDemoUserName(operation.author)}'s update`, error);
  }
}

export function stageSetDemoRace(state: SetDemoState): SetDemoResult {
  try {
    const staged = value(stageSetRace(state.room));
    let orSetNotebooks = state.orSetNotebooks;
    const operations = RACE_OPERATIONS[state.kind].map((operation) => {
      const prepared = prepareOperation({ ...state, orSetNotebooks }, operation);
      if (orSetNotebooks) {
        orSetNotebooks = applyLocalNotebook(orSetNotebooks, prepared);
      }
      return prepared;
    });
    return {
      ok: true,
      state: {
        ...state,
        phase: "queued",
        ...staged,
        deliveries: state.deliveries,
        latestDeliveries: [],
        queuedOperations: operations,
        orSetNotebooks,
        result: state.kind === "g-set"
          ? "Alice and Bob reported different beacons. Both records are in transit."
          : state.kind === "two-p-set"
            ? "Alice retired Eagle Creek while Bob reported it again. The records are in transit."
            : "Alice removed the old installation while Bob reported a fresh replacement. The records are in transit.",
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

function mergeOrSetNotebooks(
  notebooks: Record<ReplicaId, OrSetNotebook>,
): Record<ReplicaId, OrSetNotebook> {
  const additions = new Map<string, { element: string; tag: string }>();
  const removals = new Map<string, { element: string; tag: string }>();
  let highestTagNumber = 0;
  for (const notebook of Object.values(notebooks)) {
    for (const entry of notebook.additions) additions.set(entry.tag, entry);
    for (const entry of notebook.removals) removals.set(entry.tag, entry);
    highestTagNumber = Math.max(highestTagNumber, notebook.highestTagNumber);
  }
  for (const tag of removals.keys()) additions.delete(tag);
  const merged = {
    additions: [...additions.values()],
    removals: [...removals.values()],
    highestTagNumber,
  };
  return {
    A: structuredClone(merged),
    B: structuredClone(merged),
    C: structuredClone(merged),
  };
}

export function deliverSetDemoOperations(state: SetDemoState): SetDemoResult {
  if (!state.view.pending) {
    return failure(state, "Record delivery", "record a change first");
  }
  try {
    const delivered = value(deliverSetOperations(state.room));
    const latestDeliveries = labelDeliveries(state.queuedOperations, delivered.deliveries);
    const values = delivered.view.replicas[0]?.values ?? [];
    const deliveredRemoval = state.queuedOperations.some(
      ({ action }) => action === "remove",
    );
    const deliveredAddition = state.queuedOperations.some(
      ({ action }) => action === "add",
    );
    const result = state.kind === "g-set"
      ? `The reports were delivered to every hiker. The union contains ${values.join(", ")}.`
      : state.kind === "two-p-set"
        ? "The retirement tombstone was delivered to every hiker. Eagle Creek stays absent."
        : deliveredRemoval && deliveredAddition
          ? "Both tagged records were delivered to every hiker. The fresh Eagle Creek installation remains."
          : "The tagged record was delivered to every hiker. Their notebook pages now match.";
    return {
      ok: true,
      state: {
        ...state,
        phase: "delivered",
        ...delivered,
        deliveries: [...state.deliveries, ...latestDeliveries].slice(-36),
        latestDeliveries,
        queuedOperations: [],
        orSetNotebooks: state.orSetNotebooks
          ? mergeOrSetNotebooks(state.orSetNotebooks)
          : undefined,
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
    orSetNotebooks: state.orSetNotebooks,
    canDeliver: state.view.pending,
    result: state.result,
  };
}
