import {
  createRegisterDemoRoom,
  deliverRegisterDemo,
  stageRegisterDemoRace,
  writeRegisterDemo,
  type RegisterDemoKind,
  type RegisterDemoRoom,
  type RegisterDemoView,
  type Result,
} from "@atlas/toolkit";

export type ReplicaId = "A" | "B" | "C";
export type RegisterKind = RegisterDemoKind;
export type RegisterOperation = {
  author: ReplicaId;
  value: string;
};

export type RegisterDemoState = {
  kind: RegisterKind;
  room: RegisterDemoRoom;
  view: RegisterDemoView;
  queuedOperations: RegisterOperation[];
  history: RegisterOperation[];
  result: string;
};

export type RegisterDemoResult =
  | { ok: true; state: RegisterDemoState }
  | { ok: false; state: RegisterDemoState; error: string };

const USER_NAMES: Record<ReplicaId, string> = {
  A: "Alice",
  B: "Bob",
  C: "Carol",
};

const RACE_OPERATIONS: readonly RegisterOperation[] = [
  { author: "A", value: "Trail open" },
  { author: "B", value: "Trail closed" },
];

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

export function registerUserName(replica: ReplicaId): string {
  return USER_NAMES[replica];
}

export function registerRaceOperations(): readonly RegisterOperation[] {
  return RACE_OPERATIONS;
}

export function createRegisterDemo(kind: RegisterKind): RegisterDemoState {
  const created = value(createRegisterDemoRoom(kind));
  return {
    kind,
    room: created.room,
    view: created.view,
    queuedOperations: [],
    history: [],
    result: kind === "register-collection"
      ? "Race two unconfirmed reports, then compare the atomic and latest reads."
      : "Race Alice's open report against Bob's closed report.",
  };
}

function failure(
  state: RegisterDemoState,
  action: string,
  error: unknown,
): RegisterDemoResult {
  const message = error instanceof Error ? error.message : String(error);
  return {
    ok: false,
    state,
    error: `${action} was not completed: ${message}. The last valid register is unchanged.`,
  };
}

export function updateRegisterReplica(
  state: RegisterDemoState,
  operation: RegisterOperation,
): RegisterDemoResult {
  try {
    const updated = value(writeRegisterDemo(
      state.room,
      operation.author,
      operation.value,
    ));
    return {
      ok: true,
      state: {
        ...state,
        ...updated,
        queuedOperations: [...state.queuedOperations, operation],
        result: state.kind === "register-collection"
          ? `${registerUserName(operation.author)} submitted "${operation.value}". It stays hidden until it is sequenced.`
          : `${registerUserName(operation.author)} wrote "${operation.value}". The write is traveling.`,
      },
    };
  } catch (error) {
    return failure(state, `${registerUserName(operation.author)}'s write`, error);
  }
}

export function stageRegisterRace(state: RegisterDemoState): RegisterDemoResult {
  try {
    const staged = value(stageRegisterDemoRace(state.room));
    return {
      ok: true,
      state: {
        ...state,
        ...staged,
        queuedOperations: [...RACE_OPERATIONS],
        result: state.kind === "register-collection"
          ? "Alice and Bob submitted without seeing either report. Both writes await sequence numbers."
          : "Alice wrote \"Trail open\" while Bob wrote \"Trail closed\". Both writes are traveling.",
      },
    };
  } catch (error) {
    return failure(state, "The authored register race", error);
  }
}

export function deliverRegisterOperations(
  state: RegisterDemoState,
): RegisterDemoResult {
  if (state.view.pending === 0) {
    return failure(state, "Register delivery", "write a value first");
  }
  try {
    const delivered = value(deliverRegisterDemo(state.room));
    const result = state.kind === "lww-register"
      ? `Both writes arrived. Bob wins the T10 tie, so every hiker reads "${delivered.view.replicas[0]?.values[0]}".`
      : state.kind === "mv-register"
        ? "Both writes arrived. Every hiker keeps Trail closed and Trail open as concurrent alternatives."
        : `Both writes arrived. Atomic reads "${delivered.view.atomicValue}"; latest reads "${delivered.view.latestValue}".`;
    return {
      ok: true,
      state: {
        ...state,
        ...delivered,
        history: [...state.history, ...state.queuedOperations].slice(-18),
        queuedOperations: [],
        result,
      },
    };
  } catch (error) {
    return failure(state, "Register delivery", error);
  }
}
