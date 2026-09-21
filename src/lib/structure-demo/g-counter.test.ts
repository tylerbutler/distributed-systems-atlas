import { describe, expect, test } from "vitest";
import {
  createGCounterDemo,
  deliverRace,
  presentGCounterDemo,
  resendComponent,
  stageRace,
} from "./g-counter";

const success = <T extends { ok: boolean }>(result: T): Extract<T, { ok: true }> => {
  if (!result.ok) throw new Error("Expected the demo action to succeed");
  return result as Extract<T, { ok: true }>;
};

describe("G-counter Sluice lesson", () => {
  test("stages concurrent increments before transport delivery", () => {
    const staged = success(stageRace(createGCounterDemo())).state;
    const view = presentGCounterDemo(staged);
    expect(view.replicas.map(({ value }) => value)).toEqual([7, 3, 0]);
    expect(view.pending).toBe(true);
    expect(view.result).toContain("Two operations are waiting in Sluice");
  });

  test("Sluice delivers both operations to all three clients", () => {
    const staged = success(stageRace(createGCounterDemo())).state;
    const delivered = success(deliverRace(staged)).state;
    const view = presentGCounterDemo(delivered);
    expect(view.replicas.map(({ value }) => value)).toEqual([10, 10, 10]);
    expect(view.pending).toBe(false);
    expect(view.deliveries).toHaveLength(6);
    expect(new Set(view.deliveries.map(({ to }) => to))).toEqual(new Set(["A", "B", "C"]));
  });

  test("resending B's cumulative component changes no client value", () => {
    const staged = success(stageRace(createGCounterDemo())).state;
    const delivered = success(deliverRace(staged)).state;
    const before = presentGCounterDemo(delivered).replicas;
    const resent = success(resendComponent(delivered)).state;
    const view = presentGCounterDemo(resent);
    expect(view.replicas).toEqual(before);
    expect(view.deliveries).toHaveLength(3);
    expect(view.result).toContain("still read 10");
  });
});
