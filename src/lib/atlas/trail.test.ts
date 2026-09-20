import { describe, expect, test } from "vitest";
import type { SheetMeta } from "./graph";
import { buildAtlasEntries, buildTrail, firstTrail } from "./trail";

const sheet = (
  id: string,
  status: SheetMeta["status"] = "published",
): SheetMeta => ({
  id,
  title: id,
  summary: "",
  territory: "mechanisms",
  status,
  requires: [],
  introduces: [],
  related: [],
  scenarios: [],
  terms: [],
  references: [],
});

describe("first trail", () => {
  test("synthesizes missing planned steps while content is incomplete", () => {
    const entries = [sheet("dots-and-causal-context")];
    expect(buildTrail(entries).map(({ id, status }) => ({ id, status }))).toEqual(
      firstTrail.map(({ id }) => ({
        id,
        status: id === "dots-and-causal-context" ? "published" : "planned",
      })),
    );
  });

  test("uses the seven content entries without synthesized replacements when complete", () => {
    const entries = firstTrail.map(({ id }) => sheet(id));
    const atlasEntries = buildAtlasEntries(entries);

    expect(atlasEntries).toHaveLength(firstTrail.length);
    expect(atlasEntries.every((entry) => entries.includes(entry as SheetMeta))).toBe(true);
  });
});
