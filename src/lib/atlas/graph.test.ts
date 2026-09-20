import { describe, expect, test } from "vitest";
import { validateSheetGraph, type SheetMeta } from "./graph";
import { scenarioIds } from "../lab/scenarios";

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
    ], scenarioIds());
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
    ], scenarioIds());
    expect(issues.some((issue) => issue.problem === "requirement cycle")).toBe(
      true,
    );
  });

  test("reports nonexistent scenarios even when the sheet also declares a valid scenario", () => {
    const issues = validateSheetGraph([
      sheet({ scenarios: ["dots-concurrent-add-remove", "missing-scenario"] }),
      sheet({ id: "planned", status: "planned", scenarios: ["another-missing-scenario"] }),
    ], scenarioIds());
    expect(issues).toEqual([
      { sheet: "dots", field: "scenarios", target: "missing-scenario", problem: "missing scenario" },
      { sheet: "planned", field: "scenarios", target: "another-missing-scenario", problem: "missing scenario" },
    ]);
  });

  test("accepts catalog scenarios and sheets with no lab", () => {
    expect(validateSheetGraph([
      sheet({}),
      sheet({ id: "no-lab", scenarios: [] }),
    ], scenarioIds())).toEqual([]);
  });

  test("validates against the supplied catalog rather than hard-coded scenario IDs", () => {
    expect(validateSheetGraph([sheet({})], [])).toEqual([
      { sheet: "dots", field: "scenarios", target: "dots-concurrent-add-remove", problem: "missing scenario" },
    ]);
    expect(validateSheetGraph([
      sheet({ scenarios: ["fixture-scenario"] }),
    ], ["fixture-scenario"])).toEqual([]);
  });
});
