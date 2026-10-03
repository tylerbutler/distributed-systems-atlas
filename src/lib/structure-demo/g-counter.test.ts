import { describe, expect, test } from "vitest";
import {
  createGCounterDemo,
  deliverRace,
  incrementReplica,
  mergeReplicaCounts,
  presentGCounterDemo,
  resendUserCount,
  stageRace,
} from "./g-counter";

const success = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error("Expected the demo action to succeed");
  return result as Extract<T, { ok: true }>;
};

describe("G-counter checkpoint lesson", () => {
  test("lets each client increment its user's local count", () => {
    let state = success(incrementReplica(createGCounterDemo(), "C", 3)).state;
    state = success(incrementReplica(state, "A", 1)).state;
    const queued = presentGCounterDemo(state);
    expect(queued.replicas.map(({ value }) => value)).toEqual([1, 0, 3]);
    expect(queued.queuedOperations).toBe(2);
    expect(queued.latestAuthor).toBe("A");

    const delivered = presentGCounterDemo(success(deliverRace(state)).state);
    expect(delivered.replicas.map(({ value }) => value)).toEqual([4, 4, 4]);
    expect(delivered.replicas[0]?.counts).toEqual([
      { replicaId: "A", count: 1 },
      { replicaId: "B", count: 0 },
      { replicaId: "C", count: 3 },
    ]);
  });

  test("stages concurrent increments before transport delivery", () => {
    const staged = success(stageRace(createGCounterDemo())).state;
    const view = presentGCounterDemo(staged);
    expect(view.replicas.map(({ value }) => value)).toEqual([7, 3, 0]);
    expect(view.pending).toBe(true);
    expect(view.queuedOperations).toBe(2);
    expect(view.result).toContain("checkpoint notes are queued for sharing");
  });

  test("both checkpoint notes reach all three clients", () => {
    const staged = success(stageRace(createGCounterDemo())).state;
    const delivered = success(deliverRace(staged)).state;
    const view = presentGCounterDemo(delivered);
    expect(view.replicas.map(({ value }) => value)).toEqual([10, 10, 10]);
    expect(view.pending).toBe(false);
    expect(view.deliveries).toHaveLength(6);
    expect(new Set(view.deliveries.map(({ to }) => to))).toEqual(new Set(["A", "B", "C"]));
  });

  test("resending B's cumulative count changes no client value", () => {
    const staged = success(stageRace(createGCounterDemo())).state;
    const delivered = success(deliverRace(staged)).state;
    const before = presentGCounterDemo(delivered).replicas;
    const resent = success(resendUserCount(delivered)).state;
    const view = presentGCounterDemo(resent);
    expect(view.replicas).toEqual(before);
    expect(view.deliveries).toHaveLength(9);
    expect(view.result).toContain("still read 10");
  });

  test("merges repeated, stale, and reordered room state through the Watershed kernel", () => {
    let state = success(incrementReplica(createGCounterDemo(), "A", 7)).state;
    state = success(mergeReplicaCounts(state, { A: 7, B: 3, C: 1 })).state;
    expect(state.authoredCounts).toEqual({ A: 7, B: 3, C: 1 });
    expect(state.queuedOperations).toBe(3);
    const duplicate = success(mergeReplicaCounts(state, { A: 7, B: 3, C: 1 })).state;
    expect(duplicate).toBe(state);
    const stale = success(mergeReplicaCounts(state, { A: 4, B: 0, C: 0 })).state;
    expect(stale).toBe(state);
    const advanced = success(mergeReplicaCounts(stale, { A: 10, B: 1, C: 0 })).state;
    expect(advanced.authoredCounts).toEqual({ A: 10, B: 3, C: 1 });
    expect(advanced.queuedOperations).toBe(4);
    expect(presentGCounterDemo(success(deliverRace(advanced)).state).replicas.map(({ value }) => value))
      .toEqual([14, 14, 14]);
  });

  test("reconstructs a room from one stored snapshot", () => {
    const restored = success(mergeReplicaCounts(createGCounterDemo(), { A: 14, B: 3, C: 7 })).state;
    const settled = success(deliverRace(restored)).state;
    expect(presentGCounterDemo(settled).replicas.map(({ value }) => value)).toEqual([24, 24, 24]);
    const incremented = success(incrementReplica(settled, "A", 1)).state;
    expect(incremented.authoredCounts.A).toBe(15);
  });
});
