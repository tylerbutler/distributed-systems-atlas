import {
  actRemainingDemo,
  createRemainingDemoRoom,
  deliverRemainingDemo,
  stageRemainingDemoRace,
  type RemainingDemoKind,
  type RemainingDemoRoom,
  type RemainingDemoView,
} from "@atlas/toolkit";

export type RemainingDemoState = {
  kind: RemainingDemoKind;
  room: RemainingDemoRoom;
  view: RemainingDemoView;
};

function value<T>(
  result:
    | { ok: true; value: T }
    | { ok: false; error: { tag: string; message: string } },
): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

export function createRemainingDemo(kind: RemainingDemoKind): RemainingDemoState {
  return { kind, ...value(createRemainingDemoRoom(kind)) };
}

export function actInRemainingDemo(
  state: RemainingDemoState,
  replica: "A" | "B" | "C",
): RemainingDemoState {
  return { kind: state.kind, ...value(actRemainingDemo(state.room, replica)) };
}

export function stageRemainingRace(state: RemainingDemoState): RemainingDemoState {
  return { kind: state.kind, ...value(stageRemainingDemoRace(state.room)) };
}

export function deliverRemainingRace(state: RemainingDemoState): RemainingDemoState {
  return { kind: state.kind, ...value(deliverRemainingDemo(state.room)) };
}
