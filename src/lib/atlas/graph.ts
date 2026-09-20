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

export type SheetReference = string | {
  id: string;
  planned: true;
};

export interface SheetMeta {
  id: string;
  title: string;
  summary: string;
  territory: Territory;
  status: PublicationStatus;
  requires: SheetReference[];
  introduces: string[];
  related: SheetReference[];
  scenarios: string[];
  terms: GlossaryTerm[];
  references: BibliographyEntry[];
}

export interface GraphIssue {
  sheet: string;
  field: "id" | "requires" | "related" | "scenarios" | "terms" | "references";
  target: string;
  problem:
    | "duplicate sheet"
    | "duplicate scenario"
    | "missing sheet"
    | "requirement cycle"
    | "unmarked planned sheet"
    | "conflicting glossary term"
    | "conflicting bibliography entry"
    | "duplicate glossary anchor"
    | "duplicate bibliography anchor"
    | "missing scenario";
}

export function sheetReferenceId(reference: SheetReference): string {
  return typeof reference === "string" ? reference : reference.id;
}

export function entryAnchor(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s_]+/g, "-");
}

export function validateSheetGraph(entries: SheetMeta[], scenarioIds: readonly string[]): GraphIssue[] {
  const byId = new Map<string, SheetMeta>();
  const knownScenarios = new Set(scenarioIds);
  const issues: GraphIssue[] = [];
  const seenScenarios = new Set<string>();
  const glossary = new Map<string, GlossaryTerm>();
  const bibliography = new Map<string, BibliographyEntry>();
  const glossaryAnchors = new Map<string, string>();
  const bibliographyAnchors = new Map<string, string>();

  for (const entry of entries) {
    if (byId.has(entry.id)) {
      issues.push({
        sheet: entry.id,
        field: "id",
        target: entry.id,
        problem: "duplicate sheet",
      });
    } else {
      byId.set(entry.id, entry);
    }
  }

  for (const scenarioId of scenarioIds) {
    if (seenScenarios.has(scenarioId)) {
      issues.push({
        sheet: "scenario catalog",
        field: "scenarios",
        target: scenarioId,
        problem: "duplicate scenario",
      });
    }
    seenScenarios.add(scenarioId);
  }

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
      for (const reference of entry[field]) {
        const target = sheetReferenceId(reference);
        const targetSheet = byId.get(target);
        if (!targetSheet) {
          issues.push({
            sheet: entry.id,
            field,
            target,
            problem: "missing sheet",
          });
        } else if (
          entry.status === "published"
          && targetSheet.status === "planned"
          && typeof reference === "string"
        ) {
          issues.push({
            sheet: entry.id,
            field,
            target,
            problem: "unmarked planned sheet",
          });
        }
      }
    }
    for (const term of entry.terms) {
      const key = term.term.trim().toLocaleLowerCase();
      const anchor = entryAnchor(term.term);
      const existing = glossary.get(key);
      if (existing && existing.definition !== term.definition) {
        issues.push({
          sheet: entry.id,
          field: "terms",
          target: term.term,
          problem: "conflicting glossary term",
        });
      } else {
        glossary.set(key, term);
      }
      const anchorOwner = glossaryAnchors.get(anchor);
      if (anchorOwner && anchorOwner !== key) {
        issues.push({
          sheet: entry.id,
          field: "terms",
          target: term.term,
          problem: "duplicate glossary anchor",
        });
      } else {
        glossaryAnchors.set(anchor, key);
      }
    }
    for (const reference of entry.references) {
      const anchor = entryAnchor(reference.key);
      const existing = bibliography.get(reference.key);
      if (
        existing
        && (existing.title !== reference.title || existing.url !== reference.url)
      ) {
        issues.push({
          sheet: entry.id,
          field: "references",
          target: reference.key,
          problem: "conflicting bibliography entry",
        });
      } else {
        bibliography.set(reference.key, reference);
      }
      const anchorOwner = bibliographyAnchors.get(anchor);
      if (anchorOwner && anchorOwner !== reference.key) {
        issues.push({
          sheet: entry.id,
          field: "references",
          target: reference.key,
          problem: "duplicate bibliography anchor",
        });
      } else {
        bibliographyAnchors.set(anchor, reference.key);
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
    for (const reference of byId.get(id)?.requires ?? []) {
      const target = sheetReferenceId(reference);
      if (byId.has(target)) visit(target);
    }
    visiting.delete(id);
    visited.add(id);
  };

  for (const entry of entries) visit(entry.id);
  return issues;
}

export function buildGlossary(entries: SheetMeta[]): GlossaryTerm[] {
  const terms = new Map<string, GlossaryTerm>();
  for (const entry of entries.filter(({ status }) => status === "published")) {
    for (const term of entry.terms) {
      const key = term.term.trim().toLocaleLowerCase();
      if (!terms.has(key)) terms.set(key, term);
    }
  }
  return [...terms.values()].sort((a, b) => a.term.localeCompare(b.term));
}

export function buildBibliography(
  entries: SheetMeta[],
): BibliographyEntry[] {
  const references = new Map<string, BibliographyEntry>();
  for (const entry of entries.filter(({ status }) => status === "published")) {
    for (const reference of entry.references) {
      if (!references.has(reference.key)) references.set(reference.key, reference);
    }
  }
  return [...references.values()].sort((a, b) =>
    a.title.localeCompare(b.title),
  );
}
