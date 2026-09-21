import { describe, expect, test } from "vitest";
import {
  createSharedCounterDemo,
  deliverAllSharedOperations,
  deliverNextSharedOperation,
  presentSharedCounterDemo,
  stageSharedRace,
  updateSharedReplica,
} from "./shared-counter";

const success = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error("Expected the demo action to succeed");
  return result as Extract<T, { ok: true }>;
};

describe("SharedCounter sequencer lesson", () => {
  test("starts every hiker from the agreed count of 10", () => {
    expect(presentSharedCounterDemo(createSharedCounterDemo()).replicas)
      .toMatchObject([{ value: 10 }, { value: 10 }, { value: 10 }]);
  });

  test("stages Alice and Bob before the sequencer accepts either note", () => {
    const staged = presentSharedCounterDemo(
      success(stageSharedRace(createSharedCounterDemo())).state,
    );
    expect(staged.replicas.map(({ value }) => value)).toEqual([13, 9, 10]);
    expect(staged.queuedOperations).toBe(2);
    expect(staged.operations).toEqual([]);
  });

  test("assigns consecutive sequence numbers and converges on 12", () => {
    let state = success(stageSharedRace(createSharedCounterDemo())).state;
    state = success(deliverNextSharedOperation(state)).state;
    const first = presentSharedCounterDemo(state);
    expect(first.operations).toEqual([
      { sequenceNumber: 1, author: "A", amount: 3 },
    ]);
    expect(first.queuedOperations).toBe(1);

    const delivered = presentSharedCounterDemo(
      success(deliverNextSharedOperation(state)).state,
    );
    expect(delivered.operations).toEqual([
      { sequenceNumber: 1, author: "A", amount: 3 },
      { sequenceNumber: 2, author: "B", amount: -1 },
    ]);
    expect(delivered.replicas.map(({ value }) => value)).toEqual([12, 12, 12]);
    expect(delivered.replicas.map(({ lastAppliedSequence }) => lastAppliedSequence))
      .toEqual([2, 2, 2]);
  });

  test("accepts a burst from all three clients while work is pending", () => {
    let state = success(updateSharedReplica(createSharedCounterDemo(), "A", 1)).state;
    state = success(updateSharedReplica(state, "B", -3)).state;
    state = success(updateSharedReplica(state, "C", 3)).state;
    expect(presentSharedCounterDemo(state).replicas.map(({ value }) => value))
      .toEqual([11, 7, 13]);
    const delivered = presentSharedCounterDemo(
      success(deliverAllSharedOperations(state)).state,
    );
    expect(delivered.replicas.map(({ value }) => value)).toEqual([11, 11, 11]);
    expect(delivered.operations.map(({ sequenceNumber }) => sequenceNumber))
      .toEqual([1, 2, 3]);
  });

  test("delivery without a waiting note preserves the last valid state", () => {
    const state = createSharedCounterDemo();
    expect(deliverNextSharedOperation(state)).toMatchObject({
      ok: false,
      state,
      error: expect.stringContaining("send a change first"),
    });
  });
});
