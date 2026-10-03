import { describe, expect, test } from "vitest";
import type { SheetMeta } from "./graph";
import { buildAtlasEntries, firstTrail } from "./trail";

const sheet = (
  id: string,
  status: SheetMeta["status"] = "published",
): SheetMeta => ({
  id,
  title: id,
  summary: "",
  territory: "mechanisms",
  status,
  complexity: "intermediate",
  requires: [],
  introduces: [],
  related: [],
  scenarios: [],
  terms: [],
  references: [],
});

describe("reference catalogue", () => {
  test("does not synthesize unauthored learning-path entries", () => {
    const entries = [sheet("dots-and-causal-context")];
    expect(buildAtlasEntries(entries)).toEqual(entries);
  });

  test("sorts topics by title without mutating content order", () => {
    const entries = [sheet("vector-clocks"), sheet("local-history", "planned")];
    expect(buildAtlasEntries(entries)).toEqual([entries[1], entries[0]]);
    expect(entries.map(({ id }) => id)).toEqual(["vector-clocks", "local-history"]);
  });

  test("uses the seven content entries without synthesized replacements when complete", () => {
    const entries = firstTrail.map(({ id }) => sheet(id));
    const atlasEntries = buildAtlasEntries(entries);

    expect(atlasEntries).toHaveLength(firstTrail.length);
    expect(atlasEntries.every((entry) => entries.some((sheet) => sheet === entry))).toBe(true);
  });
});
