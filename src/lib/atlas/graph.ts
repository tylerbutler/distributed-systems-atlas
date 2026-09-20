export type Territory = "mechanisms" | "structures" | "failures" | "systems";
export type PublicationStatus = "published" | "planned";

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface BibliographyEntry {
  key: string;
  title: string;
  url: string;
}

export interface SheetMeta {
  id: string;
  title: string;
  summary: string;
  territory: Territory;
  status: PublicationStatus;
  requires: string[];
  introduces: string[];
  related: string[];
  scenarios: string[];
  terms: GlossaryTerm[];
  references: BibliographyEntry[];
}

export interface GraphIssue {
  sheet: string;
  field: "requires" | "related" | "scenarios";
  target: string;
  problem: "missing sheet" | "requirement cycle" | "missing scenario";
}

export function validateSheetGraph(entries: SheetMeta[], scenarioIds: readonly string[]): GraphIssue[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const knownScenarios = new Set(scenarioIds);
  const issues: GraphIssue[] = [];

  for (const entry of entries) {
    for (const target of entry.scenarios) {
      if (!knownScenarios.has(target)) {
        issues.push({
          sheet: entry.id,
          field: "scenarios",
          target,
          problem: "missing scenario",
        });
      }
    }
    for (const field of ["requires", "related"] as const) {
      for (const target of entry[field]) {
        if (!byId.has(target)) {
          issues.push({
            sheet: entry.id,
            field,
            target,
            problem: "missing sheet",
          });
        }
      }
    }
  }

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visiting.has(id)) {
      issues.push({
        sheet: id,
        field: "requires",
        target: id,
        problem: "requirement cycle",
      });
      return;
    }
    if (visited.has(id)) return;

    visiting.add(id);
    for (const target of byId.get(id)?.requires ?? []) visit(target);
    visiting.delete(id);
    visited.add(id);
  };

  for (const entry of entries) visit(entry.id);
  return issues;
}

export function buildGlossary(entries: SheetMeta[]): GlossaryTerm[] {
  const terms = new Map<string, GlossaryTerm>();
  for (const entry of entries) {
    for (const term of entry.terms) terms.set(term.term, term);
  }
  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));
}

export function buildBibliography(
  entries: SheetMeta[],
): BibliographyEntry[] {
  const references = new Map<string, BibliographyEntry>();
  for (const entry of entries) {
    for (const reference of entry.references) {
      references.set(reference.key, reference);
    }
  }
  return [...references.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}
