import { describe, expect, test } from "vitest";
import { validateSheetGraph, type SheetMeta } from "./graph";

const sheet = (overrides: Partial<SheetMeta>): SheetMeta => ({
  id: "dots",
  title: "Dots and causal context",
  summary: "Track one event and the history that observed it.",
  territory: "mechanisms",
  status: "published",
  requires: [],
  introduces: ["dot"],
  related: [],
  scenarios: ["dots-concurrent-add-remove"],
  terms: [{ term: "dot", definition: "A replica ID and local counter." }],
  references: [],
  ...overrides,
});

describe("validateSheetGraph", () => {
  test("reports missing required sheets", () => {
    const issues = validateSheetGraph([
      sheet({ requires: ["vector-clocks"] }),
    ]);
    expect(issues).toContainEqual({
      sheet: "dots",
      field: "requires",
      target: "vector-clocks",
      problem: "missing sheet",
    });
  });

  test("reports cycles in required reading", () => {
    const issues = validateSheetGraph([
      sheet({ id: "a", requires: ["b"] }),
      sheet({ id: "b", requires: ["a"] }),
    ]);
    expect(issues.some((issue) => issue.problem === "requirement cycle")).toBe(
      true,
    );
  });
});
