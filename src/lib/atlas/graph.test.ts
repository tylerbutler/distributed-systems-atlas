import { describe, expect, test } from "vitest";
import {
  buildBibliography,
  buildGlossary,
  validateSheetGraph,
  type SheetMeta,
} from "./graph";
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

  test("reports duplicate sheet and scenario IDs", () => {
    expect(validateSheetGraph([
      sheet({ id: "duplicate", scenarios: [] }),
      sheet({ id: "duplicate", scenarios: [] }),
    ], ["scenario", "scenario"])).toEqual([
      { sheet: "duplicate", field: "id", target: "duplicate", problem: "duplicate sheet" },
      { sheet: "scenario catalog", field: "scenarios", target: "scenario", problem: "duplicate scenario" },
    ]);
  });

  test("reports missing related sheets", () => {
    expect(validateSheetGraph([
      sheet({ related: ["missing-related"] }),
    ], scenarioIds())).toContainEqual({
      sheet: "dots",
      field: "related",
      target: "missing-related",
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

  test("requires published links to planned sheets to be explicit", () => {
    const planned = sheet({ id: "planned", status: "planned", scenarios: [] });
    expect(validateSheetGraph([
      sheet({ requires: ["planned"], related: ["planned"] }),
      planned,
    ], scenarioIds())).toEqual([
      { sheet: "dots", field: "requires", target: "planned", problem: "unmarked planned sheet" },
      { sheet: "dots", field: "related", target: "planned", problem: "unmarked planned sheet" },
    ]);
    expect(validateSheetGraph([
      sheet({
        requires: [{ id: "planned", planned: true }],
        related: [{ id: "planned", planned: true }],
      }),
      planned,
    ], scenarioIds())).toEqual([]);
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

  test("reports conflicting glossary terms and bibliography keys", () => {
    expect(validateSheetGraph([
      sheet({
        id: "first",
        terms: [{ term: "dot", definition: "A unique event identifier." }],
        references: [{ key: "paper", title: "First title", url: "https://example.com/paper" }],
      }),
      sheet({
        id: "second",
        scenarios: [],
        terms: [{ term: "dot", definition: "A wall-clock timestamp." }],
        references: [{ key: "paper", title: "Other title", url: "https://example.com/other" }],
      }),
    ], scenarioIds())).toEqual([
      { sheet: "second", field: "terms", target: "dot", problem: "conflicting glossary term" },
      { sheet: "second", field: "references", target: "paper", problem: "conflicting bibliography entry" },
    ]);
  });

  test("rejects distinct entries that produce the same HTML anchor", () => {
    expect(validateSheetGraph([
      sheet({
        id: "first",
        terms: [{ term: "a b", definition: "First spelling." }],
        references: [{ key: "Paper", title: "First paper", url: "https://example.com/first" }],
      }),
      sheet({
        id: "second",
        scenarios: [],
        terms: [{ term: "a-b", definition: "Second spelling." }],
        references: [{ key: "paper", title: "Second paper", url: "https://example.com/second" }],
      }),
    ], scenarioIds())).toEqual([
      { sheet: "second", field: "terms", target: "a-b", problem: "duplicate glossary anchor" },
      { sheet: "second", field: "references", target: "paper", problem: "duplicate bibliography anchor" },
    ]);
  });
});

describe("generated references", () => {
  test("deduplicates matching entries and excludes planned sheet metadata", () => {
    const entries = [
      sheet({
        id: "published-a",
        terms: [{ term: "dot", definition: "A unique event identifier." }],
        references: [{ key: "paper", title: "A paper", url: "https://example.com/paper" }],
      }),
      sheet({
        id: "published-b",
        scenarios: [],
        terms: [{ term: "dot", definition: "A unique event identifier." }],
        references: [{ key: "paper", title: "A paper", url: "https://example.com/paper" }],
      }),
      sheet({
        id: "planned",
        status: "planned",
        scenarios: [],
        terms: [{ term: "secret", definition: "Unpublished." }],
        references: [{ key: "secret", title: "Unpublished", url: "https://example.com/secret" }],
      }),
    ];

    expect(buildGlossary(entries)).toEqual([
      { term: "dot", definition: "A unique event identifier." },
    ]);
    expect(buildBibliography(entries)).toEqual([
      { key: "paper", title: "A paper", url: "https://example.com/paper" },
    ]);
  });
});
