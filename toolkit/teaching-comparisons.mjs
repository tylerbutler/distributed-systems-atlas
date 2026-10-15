import * as core from "./build/dev/javascript/atlas_toolkit/atlas_teaching_comparisons.mjs";
import {
  Result$isOk,
  Result$Ok$0,
  Result$Error$0,
} from "./build/dev/javascript/prelude.mjs";

const moves = new WeakMap();
const texts = new WeakMap();
const failure = (tag, message) => ({ ok: false, error: { tag, message } });

function unwrap(result) {
  if (!Result$isOk(result)) throw new Error(Result$Error$0(result));
  return Result$Ok$0(result);
}

function create(store, make, snapshot) {
  try {
    const state = unwrap(make());
    const view = snapshot(state);
    const room = Object.freeze({});
    store.set(room, state);
    return { ok: true, value: { room, view } };
  } catch (error) {
    return failure("kernel-error", String(error));
  }
}

function update(store, room, action, snapshot) {
  if (!room || typeof room !== "object" || !store.has(room)) {
    return failure("invalid-handle", "Expected a live comparison handle.");
  }
  try {
    const next = unwrap(action(store.get(room)));
    const view = snapshot(next);
    store.set(room, next);
    return { ok: true, value: { room, view } };
  } catch (error) {
    return failure("invalid-state", String(error));
  }
}

const moveView = (state) => JSON.parse(core.move_snapshot(state));
const textView = (state) => JSON.parse(unwrap(core.text_snapshot(state)));

export const createMoveComparison = () => create(moves, core.new_move, moveView);
export const stageMoveComparison = (room) =>
  update(moves, room, core.stage_move, moveView);
export function deliverMoveComparison(room, reverse = false) {
  if (typeof reverse !== "boolean") return failure("invalid-input", "reverse must be a boolean.");
  return update(moves, room, (state) => core.deliver_move(state, reverse), moveView);
}
export const createTextComparison = () => create(texts, core.new_text, textView);
export const stageTextComparison = (room) =>
  update(texts, room, core.stage_text, textView);
export function deliverTextComparison(room, reverse = false) {
  if (typeof reverse !== "boolean") return failure("invalid-input", "reverse must be a boolean.");
  return update(texts, room, (state) => core.deliver_text(state, reverse), textView);
}
