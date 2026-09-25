import {
  createRegisterDemoRoom,
  deliverRegisterDemo,
  stageRegisterDemoRace,
  writeRegisterDemo,
  writeRegisterMapDemo,
  type RegisterDemoKind,
  type RegisterDemoRoom,
  type RegisterDemoView,
  type Result,
} from "@atlas/toolkit";
import { demoReplicaName, type DemoReplicaId } from "./replicas";

export type ReplicaId = DemoReplicaId;
export type RegisterKind = RegisterDemoKind;
export type RegisterOperation = {
  author: ReplicaId;
  key: string;
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

const RACE_OPERATIONS: readonly RegisterOperation[] = [
  { author: "A", key: "trail-status", value: "Trail open" },
  { author: "B", key: "trail-status", value: "Trail closed" },
];
const REGISTER_MAP_RACE_OPERATIONS: readonly RegisterOperation[] = [
  ...RACE_OPERATIONS,
  { author: "C", key: "radio-channel", value: "Channel 4" },
];

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

export function registerUserName(replica: ReplicaId): string {
  return demoReplicaName(replica);
}

export function registerRaceOperations(
  kind: RegisterKind,
): readonly RegisterOperation[] {
  return kind === "register-map" ? REGISTER_MAP_RACE_OPERATIONS : RACE_OPERATIONS;
}

export function createRegisterDemo(kind: RegisterKind): RegisterDemoState {
  const created = value(createRegisterDemoRoom(kind));
  return {
    kind,
    room: created.room,
    view: created.view,
    queuedOperations: [],
    history: [],
    result: kind === "register-map"
      ? "Race two unconfirmed trail reports while Carol updates another field."
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
    const updated = value(state.kind === "register-map"
      ? writeRegisterMapDemo(
        state.room,
        operation.author,
        operation.key,
        operation.value,
      )
      : writeRegisterDemo(
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
        result: state.kind === "register-map"
          ? `${registerUserName(operation.author)} submitted ${operation.key}: "${operation.value}". It stays hidden until it is sequenced.`
          : `${registerUserName(operation.author)} wrote "${operation.value}". The write is in transit.`,
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
        queuedOperations: [...registerRaceOperations(state.kind)],
        result: state.kind === "register-map"
          ? "Alice and Bob submitted the same field from sequence 0. Carol updated radio-channel independently. All three writes await sequence numbers."
          : "Alice wrote \"Trail open\" while Bob wrote \"Trail closed\". Both writes are in transit.",
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
      ? `Both writes were delivered. Bob's sequence number 2 is greater than Alice's 1, so every hiker reads "${delivered.view.replicas[0]?.values[0]}".`
      : state.kind === "mv-register"
        ? "Both writes were delivered. Every hiker keeps Trail closed and Trail open as concurrent alternatives."
        : state.queuedOperations.length === 3
          ? `All three writes were delivered. trail-status reads "${delivered.view.atomicValue}" atomically and "${delivered.view.latestValue}" as latest. radio-channel reads "Channel 4".`
          : `Carol referenced sequence ${delivered.view.sequenceNumber - 1}. Her write can replace the atomic trail-status, so atomic and latest both read "${delivered.view.atomicValue}".`;
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
