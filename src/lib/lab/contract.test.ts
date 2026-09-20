import { describe, expect, test } from "vitest";
import { compareVectors } from "./contract";

describe("compareVectors", () => {
  test("detects before, after, equal, and concurrent vectors", () => {
    expect(compareVectors({ A: 1 }, { A: 2 })).toBe("before");
    expect(compareVectors({ A: 2 }, { A: 1 })).toBe("after");
    expect(compareVectors({ A: 2, B: 1 }, { A: 2, B: 1 })).toBe("equal");
    expect(compareVectors({ A: 2 }, { A: 1, B: 1 })).toBe("concurrent");
  });
});
