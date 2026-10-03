import { describe, expect, test } from "vitest";
import {
  createSharedCounterDemo,
  createLiveSharedCounterDemo,
  deliverAllSharedOperations,
  deliverNextSharedOperation,
  presentSharedCounterDemo,
  stageSharedRace,
  updateSharedReplica,
  receiveSharedCounterOperation,
  rollbackSharedChanges,
} from "./shared-counter";
import {
  createSharedCounter, incrementSharedCounter, inspectSharedCounter,
  acknowledgeSharedCounter, rollbackSharedCounter, type Result,
} from "@atlas/toolkit";
import { MAX_SHARED_AMOUNT, type SequencedCounterOperation } from "../../../worker/shared-counter-protocol";

const success = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error("Expected the demo action to succeed");
  return result as Extract<T, { ok: true }>;
};

describe("SharedCounter sequencer lesson", () => {
  test("starts every hiker from the agreed count of 10", () => {
    expect(presentSharedCounterDemo(createSharedCounterDemo()).replicas)
      .toMatchObject([{ value: 10 }, { value: 10 }, { value: 10 }]);
  });

  const nativeValue = <T>(result: Result<T>): T => {
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };

  describe("SharedCounter native live mode", () => {
    test("uses optimistic kernel edits and native FIFO acknowledgement, not a second increment", () => {
      let state = success(updateSharedReplica(createLiveSharedCounterDemo(), "A", 3)).state;
      state = success(updateSharedReplica(state, "A", 1)).state;
      expect(presentSharedCounterDemo(state).replicas.map(({ value }) => value)).toEqual([14, 10, 10]);
      expect(presentSharedCounterDemo(state).canDeliver).toBe(false);
      if (state.mode !== "live") throw new Error("Expected native room state");
      const [first, second] = state.live.pending;
      const operations: SequencedCounterOperation[] = [
        { id: crypto.randomUUID(), sequenceNumber: 1, author: "B", amount: -1 },
        { id: first.id, sequenceNumber: 2, author: "A", amount: 3 },
        { id: second.id, sequenceNumber: 3, author: "A", amount: 1 },
      ];
      for (const operation of operations) state = success(receiveSharedCounterOperation(state, operation)).state;
      state = success(deliverAllSharedOperations(state)).state;
      expect(presentSharedCounterDemo(state).replicas.map(({ value }) => value)).toEqual([13, 13, 13]);
      expect(presentSharedCounterDemo(state).replicas.map(({ optimistic }) => optimistic)).toEqual([false, false, false]);
      expect(presentSharedCounterDemo(state).sequenceNumber).toBe(3);
      const duplicate = success(receiveSharedCounterOperation(state, operations[2])).state;
      expect(duplicate).toBe(state);
    });

    test("does not fabricate a missing server sequence, and replays actual numbers beyond the UI log window", () => {
      const history = Array.from({ length: 20 }, (_, index): SequencedCounterOperation => ({
        id: crypto.randomUUID(), sequenceNumber: index + 1, author: "C", amount: 1,
      }));
      const state = createLiveSharedCounterDemo(history);
      const view = presentSharedCounterDemo(state);
      expect(view.replicas.map(({ value }) => value)).toEqual([30, 30, 30]);
      expect(view.sequenceNumber).toBe(20);
      expect(view.operations.map(({ sequenceNumber }) => sequenceNumber)).toEqual(
        Array.from({ length: 12 }, (_, index) => index + 9),
      );
      expect(receiveSharedCounterOperation(state, {
        id: crypto.randomUUID(), sequenceNumber: 22, author: "A", amount: 3,
      })).toMatchObject({ ok: false, state, error: expect.stringContaining("missing sequence") });
    });

    test("rolls back unsent changes through the native kernel and refuses local races in live mode", () => {
      let state = success(updateSharedReplica(createLiveSharedCounterDemo(), "A", 3)).state;
      state = success(updateSharedReplica(state, "A", -1)).state;
      state = success(rollbackSharedChanges(state)).state;
      expect(presentSharedCounterDemo(state).replicas.map(({ value }) => value)).toEqual([13, 10, 10]);
      state = success(rollbackSharedChanges(state, true)).state;
      expect(presentSharedCounterDemo(state).replicas.map(({ value }) => value)).toEqual([10, 10, 10]);
      expect(stageSharedRace(state)).toMatchObject({ ok: false, state });
    });

    test("preserves immutable states and reports the kernel's FIFO and LIFO mismatch errors", () => {
      const original = nativeValue(createSharedCounter(10));
      const first = nativeValue(incrementSharedCounter(original, 3));
      const second = nativeValue(incrementSharedCounter(first.state, -1));
      expect(nativeValue(inspectSharedCounter(original))).toEqual({ value: 10, pending: 0 });
      expect(acknowledgeSharedCounter(second.state, -1, second.messageId)).toMatchObject({ ok: false });
      expect(rollbackSharedCounter(second.state, 3, first.messageId)).toMatchObject({ ok: false });
      const acknowledged = nativeValue(acknowledgeSharedCounter(second.state, 3, first.messageId));
      expect(nativeValue(inspectSharedCounter(acknowledged))).toEqual({ value: 12, pending: 1 });
      const rolledBack = nativeValue(rollbackSharedCounter(acknowledged, -1, second.messageId));
      expect(nativeValue(inspectSharedCounter(rolledBack))).toEqual({ value: 13, pending: 0 });
      expect(incrementSharedCounter(original, Number.MAX_SAFE_INTEGER)).toMatchObject({ ok: false });
    });

    test("replays the full bounded log with exact values and stops accepting local edits at the ceiling", () => {
      const history = Array.from({ length: 1000 }, (_, index): SequencedCounterOperation => ({
        id: crypto.randomUUID(), sequenceNumber: index + 1, author: "C", amount: MAX_SHARED_AMOUNT,
      }));
      const state = createLiveSharedCounterDemo(history);
      const expected = 10 + MAX_SHARED_AMOUNT * 1000;
      expect(Number.isSafeInteger(expected)).toBe(true);
      expect(presentSharedCounterDemo(state).replicas.map(({ value }) => value))
        .toEqual([expected, expected, expected]);
      expect(updateSharedReplica(state, "A", 1)).toMatchObject({ ok: false, state });
    });
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
