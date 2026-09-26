import type { SheetMeta, Territory } from "./graph";

export interface TrailStep {
  id: string;
  title: string;
  territory: Territory;
  complexity: SheetMeta["complexity"];
}

export const firstTrail = [
  { id: "multi-value-registers", title: "Multi-value registers", territory: "structures", complexity: "intermediate" },
  { id: "observed-remove-sets", title: "Observed-remove sets", territory: "structures", complexity: "advanced" },
  { id: "dots-and-causal-context", title: "Dots and causal context", territory: "mechanisms", complexity: "advanced" },
  { id: "local-history", title: "Local history", territory: "mechanisms", complexity: "introductory" },
  { id: "partial-order", title: "Partial order", territory: "mechanisms", complexity: "intermediate" },
  { id: "lamport-clocks", title: "Lamport clocks", territory: "mechanisms", complexity: "intermediate" },
  { id: "vector-clocks", title: "Vector clocks", territory: "mechanisms", complexity: "advanced" },
] as const satisfies readonly TrailStep[];

export const pairedSheets = {
  "multi-value-register": { sheet: "multi-value-registers", lesson: "MvRegister" },
  "observed-remove-set": { sheet: "observed-remove-sets", lesson: "Observed-remove set" },
} as const;

export function pairedLessonForSheet(id: string) {
  return Object.entries(pairedSheets).find(([, pair]) => pair.sheet === id);
}

export type TrailEntry = Pick<
  SheetMeta,
  "id" | "title" | "summary" | "territory" | "status" | "complexity" | "requires"
>;

export function buildTrail(entries: SheetMeta[]): TrailEntry[] {
  return firstTrail.map((step) =>
    entries.find(({ id }) => id === step.id) ?? {
      ...step,
      summary: "",
      status: "planned",
      requires: [],
    }
  );
}

export function buildAtlasEntries(entries: SheetMeta[]): TrailEntry[] {
  const trail = buildTrail(entries);
  const trailIds = new Set<string>(firstTrail.map(({ id }) => id));
  return [...trail, ...entries.filter(({ id }) => !trailIds.has(id))];
}

export function trailPosition(id: string): number {
  return firstTrail.findIndex((step) => step.id === id);
}
