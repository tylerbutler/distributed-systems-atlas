import { describe, expect, test } from "vitest";
import {
  createPNCounterDemo,
  deliverPNOperations,
  pnCounterComponentCount,
  presentPNCounterDemo,
  stageCorrectionRace,
  updatePNReplica,
} from "./pn-counter";

const success = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error("Expected the demo action to succeed");
  return result as Extract<T, { ok: true }>;
};

describe("PN-counter correction lesson", () => {
  test("starts every hiker from the agreed count of 10", () => {
    const view = presentPNCounterDemo(createPNCounterDemo());
    expect(view.replicas.map(({ value }) => value)).toEqual([10, 10, 10]);
    expect(view.replicas.map(({ positive }) =>
      pnCounterComponentCount(positive, "starting-count"))).toEqual([10, 10, 10]);
  });

  test("stages a new count and a correction before delivery", () => {
    const staged = presentPNCounterDemo(
      success(stageCorrectionRace(createPNCounterDemo())).state,
    );
    expect(staged.replicas.map(({ value }) => value)).toEqual([13, 9, 10]);
    expect(staged.queuedOperations).toBe(2);
    expect(staged.result).toContain("Both checkpoint notes are in transit");
  });

  test("mixed-sign notes converge on 12", () => {
    const staged = success(stageCorrectionRace(createPNCounterDemo())).state;
    const delivered = presentPNCounterDemo(success(deliverPNOperations(staged)).state);
    expect(delivered.replicas.map(({ value }) => value)).toEqual([12, 12, 12]);
    expect(delivered.latestDeliveries).toHaveLength(6);
    expect(new Set(delivered.latestDeliveries.map(({ to }) => to)))
      .toEqual(new Set(["A", "B", "C"]));
    for (const replica of delivered.replicas) {
      expect(pnCounterComponentCount(replica.positive, "A")).toBe(3);
      expect(pnCounterComponentCount(replica.negative, "B")).toBe(1);
    }
  });

  test("manual additions and corrections can produce a negative value", () => {
    let state = success(updatePNReplica(createPNCounterDemo(), "C", -3)).state;
    state = success(updatePNReplica(state, "A", -3)).state;
    state = success(updatePNReplica(state, "B", -7)).state;
    const delivered = presentPNCounterDemo(success(deliverPNOperations(state)).state);
    expect(delivered.replicas.map(({ value }) => value)).toEqual([-3, -3, -3]);
  });

  test("delivery without a waiting note preserves the last valid state", () => {
    const state = createPNCounterDemo();
    const result = deliverPNOperations(state);
    expect(result).toMatchObject({
      ok: false,
      state,
      error: expect.stringContaining("record a change first"),
    });
  });
});
