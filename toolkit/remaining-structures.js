import * as core from "./build/dev/javascript/atlas_toolkit/atlas_remaining_structures.mjs";
import {
  Result$Error$0,
  Result$isOk,
  Result$Ok$0,
} from "./build/dev/javascript/prelude.mjs";

const rooms = new WeakMap();

function failure(tag, message) {
  return { ok: false, error: { tag, message } };
}

function kernel(result) {
  if (!Result$isOk(result)) {
    throw new Error(Result$Error$0(result) ?? "Watershed rejected the operation");
  }
  return Result$Ok$0(result);
}

function handle(value) {
  if (value === null || typeof value !== "object" || !rooms.has(value)) {
    throw new Error("expected a live remaining-structure demo room");
  }
  return rooms.get(value);
}

function box(value) {
  const room = Object.freeze({});
  rooms.set(room, value);
  return room;
}

function view(value) {
  const snapshot = kernel(core.remaining_demo_snapshot(value));
  return {
    replicas: [
      {
        id: "A",
        values: Array.from(
          core.RemainingDemoSnapshot$RemainingDemoSnapshot$a(snapshot),
        ),
      },
      {
        id: "B",
        values: Array.from(
          core.RemainingDemoSnapshot$RemainingDemoSnapshot$b(snapshot),
        ),
      },
      {
        id: "C",
        values: Array.from(
          core.RemainingDemoSnapshot$RemainingDemoSnapshot$c(snapshot),
        ),
      },
    ],
    pending:
      core.RemainingDemoSnapshot$RemainingDemoSnapshot$pending(snapshot),
    sequenceNumber:
      core.RemainingDemoSnapshot$RemainingDemoSnapshot$sequence_number(snapshot),
  };
}

function update(current, action) {
  try {
    const room = current;
    const next = kernel(action(handle(room)));
    const snapshot = view(next);
    rooms.set(room, next);
    return { ok: true, value: { room, view: snapshot } };
  } catch (error) {
    return failure("invalid-state", error instanceof Error ? error.message : String(error));
  }
}

export function createRemainingDemoRoom(kind) {
  if (typeof kind !== "string") return failure("invalid-input", "kind must be a string");
  try {
    const state = kernel(core.new_remaining_demo(kind));
    const room = box(state);
    return { ok: true, value: { room, view: view(state) } };
  } catch (error) {
    return failure("invalid-input", error instanceof Error ? error.message : String(error));
  }
}

export function actRemainingDemo(current, replica) {
  if (replica !== "A" && replica !== "B" && replica !== "C") {
    return failure("invalid-input", "replica must be A, B, or C");
  }
  return update(current, (room) => core.remaining_demo_act(room, replica));
}

export function insertRemainingSequenceStop(current, replica, index, stop) {
  if (replica !== "A" && replica !== "B" && replica !== "C") {
    return failure("invalid-input", "replica must be A, B, or C");
  }
  if (!Number.isSafeInteger(index) || index < 0) {
    return failure("invalid-input", "insertion position must be a nonnegative integer");
  }
  if (typeof stop !== "string" || !stop.trim() || stop.trim().length > 40) {
    return failure("invalid-input", "trail stop name must contain 1 to 40 characters");
  }
  return update(current, (room) =>
    core.remaining_demo_insert(room, replica, index, stop.trim()));
}

export function stageRemainingDemoRace(current) {
  return update(current, core.remaining_demo_stage_race);
}

export function deliverRemainingDemo(current) {
  return update(current, core.remaining_demo_deliver);
}
