import {
  acquireRemainingQueueJob,
  addRemainingQueueJob,
  completeRemainingQueueJob,
  actRemainingDemo,
  createRemainingDemoRoom,
  deliverRemainingDemo,
  editRemainingSharedText,
  insertRemainingSequenceStop,
  releaseRemainingQueueJob,
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

export function addQueueJob(
  state: RemainingDemoState,
  replica: "A" | "B" | "C",
  job: string,
): RemainingDemoState {
  return { kind: state.kind, ...value(addRemainingQueueJob(state.room, replica, job)) };
}

export function acquireQueueJob(
  state: RemainingDemoState,
  replica: "A" | "B" | "C",
): RemainingDemoState {
  return { kind: state.kind, ...value(acquireRemainingQueueJob(state.room, replica)) };
}

export function completeQueueJob(
  state: RemainingDemoState,
  replica: "A" | "B" | "C",
): RemainingDemoState {
  return { kind: state.kind, ...value(completeRemainingQueueJob(state.room, replica)) };
}

export function releaseQueueJob(
  state: RemainingDemoState,
  replica: "A" | "B" | "C",
): RemainingDemoState {
  return { kind: state.kind, ...value(releaseRemainingQueueJob(state.room, replica)) };
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

export function insertSequenceStop(
  state: RemainingDemoState,
  replica: "A" | "B" | "C",
  index: number,
  stop: string,
): RemainingDemoState {
  return { kind: state.kind, ...value(insertRemainingSequenceStop(state.room, replica, index, stop)) };
}

export function editSharedText(
  state: RemainingDemoState,
  replica: "A" | "B" | "C",
  start: number,
  end: number,
  inserted: string,
): RemainingDemoState {
  return { kind: state.kind, ...value(editRemainingSharedText(state.room, replica, start, end, inserted)) };
}

export function stageRemainingRace(state: RemainingDemoState): RemainingDemoState {
  return { kind: state.kind, ...value(stageRemainingDemoRace(state.room)) };
}

export function deliverRemainingRace(state: RemainingDemoState): RemainingDemoState {
  return { kind: state.kind, ...value(deliverRemainingDemo(state.room)) };
}
