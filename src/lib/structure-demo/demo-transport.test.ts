import { describe, expect, it } from "vitest";
import { demoTransportDuration } from "./demo-transport";

describe("demo transport duration", () => {
  it("applies the speed multiplier", () => {
    expect(demoTransportDuration(800, 1)).toBe(800);
    expect(demoTransportDuration(800, 2)).toBe(400);
  });

  it("only adds jitter within the configured range", () => {
    expect(demoTransportDuration(800, 1, 120, () => 0)).toBe(800);
    expect(demoTransportDuration(800, 1, 120, () => 1)).toBe(920);
  });

  it("keeps very fast deliveries visible", () => {
    expect(demoTransportDuration(100, 2)).toBe(120);
  });
});
