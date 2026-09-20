# Distributed Systems Atlas Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a standalone Astro site with a typed atlas, a deterministic causal simulation engine, and a complete Dots and causal context proof page.

**Architecture:** Create a new repository for the publication. Astro renders the editorial shell and content at build time. A framework-free custom element loads the lab on visible sheets, sends explicit actions to a pure TypeScript engine, and renders each view from an immutable trace frame.

**Tech Stack:** Astro 7, TypeScript 7, pnpm 11, native custom elements, Vitest, Playwright

**Spec:** `docs/superpowers/specs/2026-09-20-distributed-systems-atlas-design.md`

## Global Constraints

- Build this as a separate repository. Do not add the application under `watershed/website`.
- Use `distributed-systems-atlas` as the repository and package working name until naming work replaces it.
- Target engineers who are studying distributed systems. Do not require Gleam or Watershed knowledge.
- Use the signal-observatory visual world. Keep technical terms exact.
- Render article prose and a useful static lab state without client JavaScript.
- Store simulation state in the engine trace. Do not infer state from the DOM or animation progress.
- Keep the first milestone to the landing page, atlas index, content graph, shared lab, and Dots and causal context proof page.
- Use reference TypeScript models in this milestone. Do not add a Watershed dependency yet.
- Keep animation optional. Reduced-motion mode must preserve all state changes and explanations.
- Show adapter and engine errors with the attempted action and last valid frame.
- Use plain labels for assistive text. Do not put visual-world terminology in `aria-label` text.
- Do not add accounts, progress tracking, quizzes, comments, a CMS, or a public plugin API.

---

## Planned repository structure

All paths below are relative to the new `distributed-systems-atlas` repository.

```text
.
├── astro.config.mjs
├── package.json
├── playwright.config.ts
├── tsconfig.json
├── public/
│   └── favicon.svg
├── src/
│   ├── components/
│   │   ├── AtlasCard.astro
│   │   ├── CausalLab.astro
│   │   ├── SheetLinks.astro
│   │   └── SiteHeader.astro
│   ├── content/
│   │   └── sheets/
│   │       └── dots-and-causal-context.mdx
│   ├── content.config.ts
│   ├── layouts/
│   │   ├── BaseLayout.astro
│   │   └── SheetLayout.astro
│   ├── lib/
│   │   ├── atlas/
│   │   │   ├── graph.test.ts
│   │   │   └── graph.ts
│   │   ├── lab/
│   │   │   ├── causal-engine.test.ts
│   │   │   ├── causal-engine.ts
│   │   │   ├── causal-lab-element.ts
│   │   │   ├── contract.test.ts
│   │   │   ├── contract.ts
│   │   │   ├── scenarios.test.ts
│   │   │   └── scenarios.ts
│   ├── pages/
│   │   ├── atlas/
│   │   │   ├── [id].astro
│   │   │   └── index.astro
│   │   └── index.astro
│   └── styles/
│       ├── global.css
│       └── lab.css
└── tests/
    ├── accessibility.spec.ts
    ├── dots-lab.spec.ts
    └── static-content.spec.ts
```

`src/lib/lab/contract.ts` owns the engine-neutral boundary. The causal engine,
scenario catalog, custom element, and tests depend on it. Article components
consume trace data but do not import engine internals.

`src/content.config.ts` owns the sheet schema. `src/lib/atlas/graph.ts` owns
cross-entry validation and generated glossary and bibliography data.

## Follow-on plans

This plan establishes the first independently testable milestone. Write two
later plans after the proof page passes editorial and interaction review:

1. **Watershed lab runtime package:** add a stable JavaScript package boundary
   in the Watershed repository for the MV-register and OR-Set kernels.
2. **Concurrency trail completion:** add the other six sheets, the Watershed
   adapters, generated glossary and bibliography pages, and release checks for
   the complete first trail.

Do not mix those changes into this milestone. The proof page should test the
content and lab model before the project commits to a package API or seven
articles.

---

### Task 1: Create the standalone Astro repository and test gates

**Files:**
- Create: `package.json`
- Create: `astro.config.mjs`
- Create: `tsconfig.json`
- Create: `playwright.config.ts`
- Create: `src/pages/index.astro`
- Create: `src/styles/global.css`
- Create: `tests/static-content.spec.ts`

**Interfaces:**
- Produces: `pnpm check`, `pnpm test`, `pnpm test:browser`, and `pnpm build`
- Produces: static Astro output in `dist/`

- [ ] **Step 1: Create the repository**

```bash
mkdir distributed-systems-atlas
cd distributed-systems-atlas
git init
pnpm create astro@latest . --template minimal --typescript strict --install --no-git
pnpm add astro@^7.1.0 @astrojs/mdx
pnpm add -D @astrojs/check typescript@^7.0.2 vitest @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: Replace the generated package scripts**

Write `package.json` with these scripts while retaining the dependency versions
selected by the Astro scaffold:

```json
{
  "name": "distributed-systems-atlas",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@11.13.1",
  "scripts": {
    "dev": "astro dev",
    "check": "astro check && tsc --noEmit",
    "test": "vitest run",
    "test:browser": "playwright test",
    "build": "pnpm check && pnpm test && astro build"
  }
}
```

- [ ] **Step 3: Configure static output**

Write `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import mdx from "@astrojs/mdx";

export default defineConfig({
  output: "static",
  integrations: [mdx()],
  devToolbar: { enabled: false },
});
```

- [ ] **Step 4: Add the browser-test configuration**

Write `playwright.config.ts`:

```ts
import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  use: {
    baseURL: "http://127.0.0.1:4321",
  },
  webServer: {
    command: "pnpm dev --host 127.0.0.1",
    url: "http://127.0.0.1:4321",
    reuseExistingServer: !process.env.CI,
  },
});
```

- [ ] **Step 5: Write the first browser test**

Write `tests/static-content.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("landing page works without client JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Distributed systems",
  );
  await expect(page.getByRole("link", { name: "Open the atlas" })).toBeVisible();
});
```

- [ ] **Step 6: Add a minimal static landing page and global stylesheet**

Write `src/pages/index.astro` with a document title, one `h1`, a short
description of the atlas, and an `Open the atlas` link to `/atlas/`. Import
`src/styles/global.css` through the page frontmatter.

Define only the first tokens in `src/styles/global.css`:

```css
:root {
  --night: #111827;
  --paper: #f4f0e6;
  --signal: #d84a3a;
  --signal-cool: #176b87;
  --muted: #667085;
  --line: #b8b2a5;
  --content: 72rem;
  color: var(--night);
  background: var(--paper);
  font-family: "Iowan Old Style", "Palatino Linotype", serif;
}

body {
  margin: 0;
}

a {
  color: var(--signal-cool);
}
```

- [ ] **Step 7: Run the initial gates**

Run:

```bash
pnpm check
pnpm test
pnpm test:browser
pnpm build
```

Expected: all commands pass and `dist/index.html` exists.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml astro.config.mjs tsconfig.json \
  playwright.config.ts src/pages/index.astro src/styles/global.css \
  tests/static-content.spec.ts
git commit -m "chore: scaffold distributed systems atlas"
```

---

### Task 2: Define and validate the atlas content graph

**Files:**
- Create: `src/content.config.ts`
- Create: `src/lib/atlas/graph.ts`
- Create: `src/lib/atlas/graph.test.ts`

**Interfaces:**
- Produces: `SheetMeta`
- Produces: `validateSheetGraph(entries: SheetMeta[]): GraphIssue[]`
- Produces: `buildGlossary(entries: SheetMeta[]): GlossaryTerm[]`
- Produces: `buildBibliography(entries: SheetMeta[]): BibliographyEntry[]`

- [ ] **Step 1: Write graph validation tests**

Write `src/lib/atlas/graph.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/atlas/graph.test.ts
```

Expected: FAIL because `src/lib/atlas/graph.ts` does not exist.

- [ ] **Step 3: Implement the graph types and validation**

Write `src/lib/atlas/graph.ts`:

```ts
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
  field: "requires" | "related";
  target: string;
  problem: "missing sheet" | "requirement cycle";
}

export function validateSheetGraph(entries: SheetMeta[]): GraphIssue[] {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const issues: GraphIssue[] = [];

  for (const entry of entries) {
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
```

- [ ] **Step 4: Define the Astro collection schema**

Write `src/content.config.ts`:

```ts
import { defineCollection, z } from "astro:content";
import { glob } from "astro/loaders";

const sheet = defineCollection({
  loader: glob({ pattern: "**/*.{md,mdx}", base: "./src/content/sheets" }),
  schema: z.object({
    title: z.string(),
    summary: z.string(),
    territory: z.enum(["mechanisms", "structures", "failures", "systems"]),
    status: z.enum(["published", "planned"]),
    requires: z.array(z.string()).default([]),
    introduces: z.array(z.string()).default([]),
    related: z.array(z.string()).default([]),
    scenarios: z.array(z.string()).default([]),
    terms: z
      .array(z.object({ term: z.string(), definition: z.string() }))
      .default([]),
    references: z
      .array(
        z.object({
          key: z.string(),
          title: z.string(),
          url: z.string().url(),
        }),
      )
      .default([]),
  }),
});

export const collections = { sheet };
```

- [ ] **Step 5: Run the focused tests**

Run:

```bash
pnpm vitest run src/lib/atlas/graph.test.ts
pnpm check
```

Expected: the unit test and Astro schema check pass.

- [ ] **Step 6: Commit**

```bash
git add src/content.config.ts src/lib/atlas/graph.ts \
  src/lib/atlas/graph.test.ts
git commit -m "feat: add typed atlas content graph"
```

---

### Task 3: Define the engine-neutral lab contract

**Files:**
- Create: `src/lib/lab/contract.ts`
- Create: `src/lib/lab/contract.test.ts`

**Interfaces:**
- Produces: `Dot`, `VersionVector`, `ReplicaView`, `MessageView`, `TraceFrame`
- Produces: `LabAction`, `LabError`, `SimulationEngine`
- Produces: `compareVectors(left, right): CausalRelation`

- [ ] **Step 1: Write contract behavior tests**

Write `src/lib/lab/contract.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/lab/contract.test.ts
```

Expected: FAIL because the contract module does not exist.

- [ ] **Step 3: Implement the contract**

Write `src/lib/lab/contract.ts`:

```ts
export type ReplicaId = string;
export type MessageId = string;
export type CausalRelation = "before" | "after" | "equal" | "concurrent";
export type VersionVector = Readonly<Record<ReplicaId, number>>;

export interface Dot {
  replica: ReplicaId;
  counter: number;
}

export interface ReplicaView {
  id: ReplicaId;
  value: readonly string[];
  clock: VersionVector;
  dots: readonly Dot[];
  context: VersionVector;
}

export interface MessageView {
  id: MessageId;
  from: ReplicaId;
  to: ReplicaId;
  kind: "delta";
  dots: readonly Dot[];
  context: VersionVector;
}

export interface TraceFrame {
  index: number;
  actionLabel: string;
  explanation: string;
  replicas: readonly ReplicaView[];
  messages: readonly MessageView[];
  partitions: readonly string[];
  invariants: Readonly<Record<string, boolean>>;
}

export type LabAction =
  | { type: "add"; replica: ReplicaId; value: string }
  | { type: "remove"; replica: ReplicaId; value: string }
  | { type: "deliver"; message: MessageId }
  | { type: "duplicate"; message: MessageId }
  | { type: "partition"; left: ReplicaId; right: ReplicaId }
  | { type: "heal"; left: ReplicaId; right: ReplicaId }
  | { type: "reset" };

export interface LabError {
  action: LabAction;
  engine: string;
  message: string;
  lastFrame: TraceFrame;
}

export interface SimulationEngine {
  current(): TraceFrame;
  dispatch(action: LabAction): TraceFrame | LabError;
  history(): readonly TraceFrame[];
}

export function compareVectors(
  left: VersionVector,
  right: VersionVector,
): CausalRelation {
  const ids = new Set([...Object.keys(left), ...Object.keys(right)]);
  let less = false;
  let greater = false;
  for (const id of ids) {
    const a = left[id] ?? 0;
    const b = right[id] ?? 0;
    less ||= a < b;
    greater ||= a > b;
  }
  if (!less && !greater) return "equal";
  if (less && !greater) return "before";
  if (greater && !less) return "after";
  return "concurrent";
}
```

- [ ] **Step 4: Run the focused test**

Run:

```bash
pnpm vitest run src/lib/lab/contract.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lab/contract.ts src/lib/lab/contract.test.ts
git commit -m "feat: define simulation trace contract"
```

---

### Task 4: Implement the deterministic causal engine

**Files:**
- Create: `src/lib/lab/causal-engine.ts`
- Create: `src/lib/lab/causal-engine.test.ts`

**Interfaces:**
- Consumes: `LabAction`, `LabError`, `SimulationEngine`, `TraceFrame`
- Produces: `createCausalEngine(config: CausalScenario): SimulationEngine`
- Produces: `CausalScenario`

- [ ] **Step 1: Write concurrent add and remove tests**

Write `src/lib/lab/causal-engine.test.ts`:

```ts
import { describe, expect, test } from "vitest";
import { createCausalEngine } from "./causal-engine";

describe("causal engine", () => {
  test("preserves a concurrent add through an observed remove", () => {
    const engine = createCausalEngine({
      id: "dots-concurrent-add-remove",
      replicas: ["A", "B"],
      initialValues: [],
    });

    engine.dispatch({ type: "add", replica: "A", value: "beacon" });
    engine.dispatch({ type: "deliver", message: "m1:A:B" });
    engine.dispatch({ type: "partition", left: "A", right: "B" });
    engine.dispatch({ type: "remove", replica: "A", value: "beacon" });
    engine.dispatch({ type: "add", replica: "B", value: "beacon" });
    engine.dispatch({ type: "heal", left: "A", right: "B" });
    engine.dispatch({ type: "deliver", message: "m2:A:B" });
    const frame = engine.dispatch({ type: "deliver", message: "m3:B:A" });

    if ("message" in frame) throw new Error(frame.message);
    expect(frame.replicas.map((replica) => replica.value)).toEqual([
      ["beacon"],
      ["beacon"],
    ]);
    expect(frame.invariants.converged).toBe(true);
  });

  test("returns an error and retains the last frame for blocked delivery", () => {
    const engine = createCausalEngine({
      id: "blocked-delivery",
      replicas: ["A", "B"],
      initialValues: [],
    });
    engine.dispatch({ type: "add", replica: "A", value: "beacon" });
    engine.dispatch({ type: "partition", left: "A", right: "B" });

    const result = engine.dispatch({ type: "deliver", message: "m1:A:B" });
    expect("message" in result).toBe(true);
    if (!("message" in result)) return;
    expect(result.message).toBe("message crosses an active partition");
    expect(result.lastFrame.partitions).toEqual(["A:B"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/lab/causal-engine.test.ts
```

Expected: FAIL because the engine module does not exist.

- [ ] **Step 3: Implement causal state and local operations**

Write `src/lib/lab/causal-engine.ts` with private state for each replica:

```ts
interface ElementState {
  adds: Map<string, Dot>;
  removed: Set<string>;
}

interface ReplicaState {
  id: string;
  clock: Record<string, number>;
  elements: Map<string, ElementState>;
}

export interface CausalScenario {
  id: string;
  replicas: string[];
  initialValues: string[];
}
```

Use `${dot.replica}:${dot.counter}` as the stable dot key. An add increments
the local clock, records the new dot, and queues one delta for each other
replica. A remove records only add dots currently observed by that replica.

- [ ] **Step 4: Implement delivery, duplication, partition, healing, and reset**

Keep messages in insertion order. Use deterministic IDs in this form:

```text
m<operation number>:<source replica>:<target replica>
```

Delivery merges add dots and removed-dot keys, then advances each vector
component by maximum. A duplicate action copies the selected queued message
with a deterministic `:copy<n>` suffix. Delivery removes only the selected
message.

Use a sorted pair such as `A:B` as the partition key. Reject delivery across a
partition with a `LabError`.

- [ ] **Step 5: Build trace frames from engine state**

Sort replicas by ID, values lexically, dots by replica then counter, and
messages by creation order. Set:

```ts
invariants: {
  uniqueDots: /* no duplicate replica-counter pair per replica state */,
  removedDotsStayRemoved: /* no removed dot contributes a visible value */,
  converged: /* all visible values and causal metadata match when no messages remain */
}
```

Every successful action appends one immutable frame. `reset` restores the
initial frame and clears history after it.

- [ ] **Step 6: Run the engine tests**

Run:

```bash
pnpm vitest run src/lib/lab/causal-engine.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/lab/causal-engine.ts src/lib/lab/causal-engine.test.ts
git commit -m "feat: add deterministic causal engine"
```

---

### Task 5: Add the canonical Dots scenario

**Files:**
- Create: `src/lib/lab/scenarios.ts`
- Create: `src/lib/lab/scenarios.test.ts`

**Interfaces:**
- Consumes: `CausalScenario`
- Produces: `scenarioById(id: string): CausalScenario`
- Produces: `scenarioIds(): string[]`

- [ ] **Step 1: Write scenario catalog tests**

Write `src/lib/lab/scenarios.test.ts`:

```ts
import { expect, test } from "vitest";
import { scenarioById, scenarioIds } from "./scenarios";

test("publishes the Dots proof scenario", () => {
  expect(scenarioIds()).toEqual(["dots-concurrent-add-remove"]);
  expect(scenarioById("dots-concurrent-add-remove")).toEqual({
    id: "dots-concurrent-add-remove",
    replicas: ["A", "B"],
    initialValues: [],
  });
});

test("rejects an unknown scenario", () => {
  expect(() => scenarioById("missing")).toThrow(
    "Unknown lab scenario: missing",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm vitest run src/lib/lab/scenarios.test.ts
```

Expected: FAIL because the scenario catalog does not exist.

- [ ] **Step 3: Implement the catalog**

Write `src/lib/lab/scenarios.ts`:

```ts
import type { CausalScenario } from "./causal-engine";

const scenarios: Record<string, CausalScenario> = {
  "dots-concurrent-add-remove": {
    id: "dots-concurrent-add-remove",
    replicas: ["A", "B"],
    initialValues: [],
  },
};

export function scenarioIds(): string[] {
  return Object.keys(scenarios).sort();
}

export function scenarioById(id: string): CausalScenario {
  const scenario = scenarios[id];
  if (!scenario) throw new Error(`Unknown lab scenario: ${id}`);
  return structuredClone(scenario);
}
```

- [ ] **Step 4: Run the focused tests**

Run:

```bash
pnpm vitest run src/lib/lab/scenarios.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/lab/scenarios.ts src/lib/lab/scenarios.test.ts
git commit -m "feat: define Dots lab scenario"
```

---

### Task 6: Build the accessible lab custom element

**Files:**
- Create: `src/components/CausalLab.astro`
- Create: `src/lib/lab/causal-lab-element.ts`
- Create: `src/styles/lab.css`
- Create: `src/pages/lab-test.astro`
- Create: `tests/dots-lab.spec.ts`
- Create: `tests/accessibility.spec.ts`

**Interfaces:**
- Consumes: `scenarioById`, `createCausalEngine`, `TraceFrame`, `LabAction`
- Produces: `<causal-lab scenario="dots-concurrent-add-remove">`

- [ ] **Step 1: Write browser tests for core controls**

Write `tests/dots-lab.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("steps through concurrent add and remove", async ({ page }) => {
  await page.goto("/lab-test/");
  const lab = page.getByTestId("causal-lab");

  await lab.getByRole("button", { name: "Add beacon at A" }).click();
  await lab.getByRole("button", { name: "Deliver m1 from A to B" }).click();
  await lab.getByRole("button", { name: "Partition A and B" }).click();
  await lab.getByRole("button", { name: "Remove beacon at A" }).click();
  await lab.getByRole("button", { name: "Add beacon at B" }).click();
  await lab.getByRole("button", { name: "Heal A and B" }).click();

  await expect(lab.getByText("A:2")).toBeVisible();
  await expect(lab.getByText("B:1")).toBeVisible();
  await expect(lab.getByText("The new B dot survives")).toBeVisible();
});

test("shows the static initial state without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/lab-test/");
  await expect(page.getByText("Initial replica state")).toBeVisible();
  await expect(page.getByText("No events observed")).toHaveCount(2);
});
```

- [ ] **Step 2: Write keyboard and reduced-motion tests**

Write `tests/accessibility.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("lab controls work by keyboard", async ({ page }) => {
  await page.goto("/lab-test/");
  await page.getByRole("button", { name: "Add beacon at A" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText(
    "A created dot A:1",
  );
});

test("reduced motion disables transition animation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab-test/");
  await expect(page.getByTestId("causal-lab")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
});
```

- [ ] **Step 3: Run browser tests to verify they fail**

Run:

```bash
pnpm test:browser --grep "lab controls|static initial|reduced motion"
```

Expected: FAIL because the page and component do not exist.

- [ ] **Step 4: Create the static Astro wrapper**

Write `src/components/CausalLab.astro`. It must:

- accept a `scenario` prop;
- render `<causal-lab data-testid="causal-lab">`;
- include two static replica cards with `Initial replica state` and
  `No events observed`;
- include a `<noscript>` note that the article remains readable but the lab
  controls need JavaScript;
- import `src/styles/lab.css`;
- load `causal-lab-element.ts` from one module script.

Create `src/pages/lab-test.astro` as a temporary test harness that renders:

```astro
---
import CausalLab from "../components/CausalLab.astro";
---

<main>
  <h1>Causal lab test</h1>
  <CausalLab scenario="dots-concurrent-add-remove" />
</main>
```

- [ ] **Step 5: Implement the custom element**

Write `src/lib/lab/causal-lab-element.ts`. On `connectedCallback`:

1. Read the required `scenario` attribute.
2. Create the engine through `scenarioById` and `createCausalEngine`.
3. Detect `prefers-reduced-motion`.
4. Replace the static state with interactive controls and views.
5. Keep the current trace index and render from `engine.history()`.

Render controls as ordinary `<button>` elements. Render state as semantic
sections and definition lists. Add `role="status"` with `aria-live="polite"`
for the latest completed action.

When `dispatch` returns `LabError`, render an alert containing the attempted
action, engine name, message, and last valid frame index. Keep the last valid
replica and message views visible.

- [ ] **Step 6: Add the lab styles**

Write `src/styles/lab.css` with:

- a two-column replica grid above `48rem`;
- one column below `48rem`;
- solid and dashed message paths that do not depend on color;
- visible focus styles;
- no transition or animation inside
  `@media (prefers-reduced-motion: reduce)`;
- `data-motion="reduced"` set on the custom element when that query matches.

- [ ] **Step 7: Run browser tests**

Run:

```bash
pnpm test:browser --grep "lab controls|static initial|reduced motion"
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/components/CausalLab.astro \
  src/lib/lab/causal-lab-element.ts src/styles/lab.css src/pages/lab-test.astro \
  tests/dots-lab.spec.ts tests/accessibility.spec.ts
git commit -m "feat: add accessible causal lab"
```

---

### Task 7: Build the atlas shell and signal-observatory identity

**Files:**
- Create: `src/layouts/BaseLayout.astro`
- Create: `src/layouts/SheetLayout.astro`
- Create: `src/components/SiteHeader.astro`
- Create: `src/components/AtlasCard.astro`
- Create: `src/components/SheetLinks.astro`
- Create: `src/pages/atlas/index.astro`
- Create: `public/favicon.svg`
- Modify: `src/pages/index.astro`
- Modify: `src/styles/global.css`
- Modify: `tests/static-content.spec.ts`

**Interfaces:**
- Consumes: Astro `sheet` collection and `SheetMeta`
- Produces: shared page chrome, atlas territory cards, sheet prerequisite links

- [ ] **Step 1: Extend static browser tests**

Add these assertions to `tests/static-content.spec.ts`:

```ts
test("atlas exposes four territories and only links published sheets", async ({
  page,
}) => {
  await page.goto("/atlas/");

  for (const name of ["Mechanisms", "Structures", "Failure modes", "Systems"]) {
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }

  await expect(
    page.getByRole("link", { name: "Dots and causal context" }),
  ).toHaveAttribute("href", "/atlas/dots-and-causal-context/");
  await expect(page.getByText("Lamport clocks").locator("..")).toContainText(
    "Planned",
  );
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
pnpm test:browser --grep "atlas exposes"
```

Expected: FAIL because `/atlas/` does not exist.

- [ ] **Step 3: Add shared layouts and navigation**

`BaseLayout.astro` owns metadata, global styles, the site header, main content,
and footer. `SheetLayout.astro` accepts a sheet entry and renders its territory,
title, summary, prerequisites, article body, related sheets, and next trail
step.

Use plain navigation labels:

```text
Atlas
Trails
Glossary
References
```

Only `Atlas` needs a working route in this milestone. Render the other items as
plain text with a visible `Planned` label rather than dead anchors.

- [ ] **Step 4: Build the atlas index**

Use `getCollection("sheet")` in `src/pages/atlas/index.astro`. Group entries by
territory. Render published entries as links and planned entries as cards with
a `Planned` status.

Map each collection entry to `SheetMeta`, call `validateSheetGraph`, and throw
one build error that joins every issue with a newline:

```ts
const sheets = await getCollection("sheet");
const issues = validateSheetGraph(
  sheets.map((entry) => ({ id: entry.id, ...entry.data })),
);
if (issues.length > 0) {
  throw new Error(
    `Invalid atlas content graph:\n${issues
      .map((issue) => `${issue.sheet}.${issue.field}: ${issue.problem} ${issue.target}`)
      .join("\n")}`,
  );
}
```

Add planned metadata for the six later trail sheets directly in the index data:

```ts
const plannedTrail = [
  ["local-history", "Local history", "mechanisms"],
  ["partial-order", "Partial order", "mechanisms"],
  ["lamport-clocks", "Lamport clocks", "mechanisms"],
  ["vector-clocks", "Vector clocks", "mechanisms"],
  ["multi-value-registers", "Multi-value registers", "structures"],
  ["observed-remove-sets", "Observed-remove sets", "structures"],
] as const;
```

Do not create placeholder routes for these entries.

- [ ] **Step 5: Apply the signal-observatory visual system**

Extend `src/styles/global.css` with:

- a dark ink and warm paper base;
- one warm signal color and one cool signal color;
- fine grid lines that suggest observation charts;
- serif display text and system sans-serif controls;
- tabular numerals for clocks and vectors;
- station markers that combine letters, geometric shapes, and color;
- generous article measure capped near `68ch`;
- responsive spacing without fixed-height hero sections.

Create original CSS and SVG marks. Do not copy The Frontendian's wizard
illustrations, layout, or assets.

Create `public/favicon.svg` as an original two-station signal mark. Use the warm
and cool signal colors, provide a square `viewBox`, and omit embedded text.

- [ ] **Step 6: Run static and type checks**

Run:

```bash
pnpm check
pnpm test:browser --grep "landing page|atlas exposes"
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/layouts src/components/SiteHeader.astro \
  src/components/AtlasCard.astro src/components/SheetLinks.astro \
  src/pages/index.astro src/pages/atlas/index.astro public/favicon.svg \
  src/styles/global.css tests/static-content.spec.ts
git commit -m "feat: add atlas publication shell"
```

---

### Task 8: Write and publish the Dots and causal context proof page

**Files:**
- Create: `src/content/sheets/dots-and-causal-context.mdx`
- Create: `src/pages/atlas/[id].astro`
- Delete: `src/pages/lab-test.astro`
- Modify: `tests/static-content.spec.ts`
- Modify: `tests/dots-lab.spec.ts`

**Interfaces:**
- Consumes: `SheetLayout`, `CausalLab`, sheet collection schema
- Produces: `/atlas/dots-and-causal-context/`

- [ ] **Step 1: Add content acceptance tests**

Add to `tests/static-content.spec.ts`:

```ts
test("Dots sheet contains the full teaching sequence", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");

  for (const heading of [
    "One event needs one name",
    "A dot is identity, not a timestamp",
    "Context records what a replica has observed",
    "Remove only what you saw",
    "Break it: discard the context",
    "What causal metadata costs",
    "Field notes",
  ]) {
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});
```

Add to `tests/dots-lab.spec.ts`:

```ts
test("Dots sheet explains the final add-wins result", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  await expect(page.getByText("B:1 was never observed by A's remove")).toBeVisible();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run:

```bash
pnpm test:browser --grep "Dots sheet"
```

Expected: FAIL because the route and article do not exist.

- [ ] **Step 3: Add the dynamic sheet route**

Write `src/pages/atlas/[id].astro` with `getCollection("sheet")`,
`getStaticPaths`, and `render`. Generate routes only for entries whose status is
`published`. Pass the entry metadata and rendered content to
`SheetLayout.astro`.

- [ ] **Step 4: Write the proof page**

Write `src/content/sheets/dots-and-causal-context.mdx` with this frontmatter:

```yaml
title: Dots and causal context
summary: Track one event and the exact history that has observed it.
territory: mechanisms
status: published
requires: []
introduces:
  - dot
  - causal context
related: []
scenarios:
  - dots-concurrent-add-remove
terms:
  - term: dot
    definition: A unique event identifier made from a replica ID and a local counter.
  - term: causal context
    definition: A compact record of the dots a replica has observed.
references:
  - key: riak-dotted-version-vectors
    title: Dotted Version Vectors
    url: https://riak.com/posts/technical/vector-clocks-revisited-part-2-dotted-version-vectors/
```

Import the shared lab after the frontmatter:

```mdx
import CausalLab from "../../components/CausalLab.astro";
```

Embed it in the interactive section:

```mdx
<CausalLab scenario="dots-concurrent-add-remove" />
```

Use these sections in order:

1. **One event needs one name:** two stations create events without a shared
   clock.
2. **A dot is identity, not a timestamp:** define `(replica, counter)` and show
   why uniqueness matters.
3. **Context records what a replica has observed:** distinguish one event from
   accumulated knowledge.
4. **Interactive lab:** embed
   `<CausalLab scenario="dots-concurrent-add-remove" />`.
5. **Remove only what you saw:** explain observed removal and the surviving
   concurrent `B:1` dot.
6. **Break it: discard the context:** show that deleting by value erases a
   concurrent add or resurrects an observed add, depending on the naive rule.
7. **What causal metadata costs:** describe per-replica counters, retained
   removal knowledge, replica retirement, and compaction.
8. **Field notes:** include pseudocode for add, remove, merge, and visible
   membership; define aliases and cite the source.

Keep the article between 1,800 and 2,800 words. Every state shown in the
interactive section must come from the scenario trace. Static explanatory
figures may use authored SVG when they do not claim to show live state.

- [ ] **Step 5: Run content and browser tests**

Update the lab browser tests to use
`/atlas/dots-and-causal-context/`, then delete `src/pages/lab-test.astro`.

Run:

```bash
pnpm test:browser --grep "Dots sheet|concurrent add and remove"
pnpm check
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/content/sheets/dots-and-causal-context.mdx \
  src/pages/atlas/'[id].astro' tests/static-content.spec.ts \
  tests/dots-lab.spec.ts src/pages/lab-test.astro
git commit -m "feat: publish Dots proof sheet"
```

---

### Task 9: Add full milestone verification

**Files:**
- Modify: `package.json`
- Modify: `tests/accessibility.spec.ts`
- Create: `README.md`

**Interfaces:**
- Produces: one `pnpm verify` command for local development and CI

- [ ] **Step 1: Add final accessibility assertions**

Extend `tests/accessibility.spec.ts`:

```ts
test("replicas and messages do not rely on color alone", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  await expect(page.getByRole("region", { name: "Replica A" })).toContainText("A");
  await expect(page.getByRole("region", { name: "Replica B" })).toContainText("B");
  await page.getByRole("button", { name: "Add beacon at A" }).click();
  await expect(page.getByRole("list", { name: "Messages in flight" })).toContainText(
    "A to B",
  );
});

test("an engine error preserves the last valid state", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  await page.getByRole("button", { name: "Add beacon at A" }).click();
  await page.getByRole("button", { name: "Partition A and B" }).click();
  await page.getByRole("button", { name: "Deliver m1 from A to B" }).click();

  await expect(page.getByRole("alert")).toContainText(
    "message crosses an active partition",
  );
  await expect(page.getByRole("region", { name: "Replica A" })).toContainText(
    "beacon",
  );
});
```

- [ ] **Step 2: Add the verification command**

Add:

```json
{
  "scripts": {
    "verify": "pnpm check && pnpm test && pnpm test:browser && astro build"
  }
}
```

- [ ] **Step 3: Document local commands and project boundaries**

Write `README.md` with:

- the publication goal and primary audience;
- `pnpm install`, `pnpm dev`, and `pnpm verify`;
- the content, scenario, engine, and renderer boundaries;
- the rule that labs render from trace frames;
- the rule that this repository does not import Watershed private build paths;
- a link to the approved design specification in the Watershed repository.

- [ ] **Step 4: Run complete verification**

Run:

```bash
pnpm verify
```

Expected:

- Astro and TypeScript checks pass.
- The Astro build reports no schema or content-graph issues.
- Vitest passes all graph, contract, engine, and scenario tests.
- Playwright passes static, lab, keyboard, reduced-motion, and error tests.
- Astro writes the static site to `dist/`.

- [ ] **Step 5: Inspect the production output without JavaScript**

Run:

```bash
pnpm exec astro preview --host 127.0.0.1
```

Open `/`, `/atlas/`, and `/atlas/dots-and-causal-context/` with JavaScript
disabled. Confirm that the article, atlas cards, initial replica state,
bibliography entry, and navigation remain readable.

- [ ] **Step 6: Commit**

```bash
git add package.json README.md tests/accessibility.spec.ts
git commit -m "test: verify atlas proof milestone"
```

---

## Milestone review gate

Do not start the Watershed package plan until a reviewer has used the proof
page and approved these points:

- The article teaches dots and causal context without requiring prior CRDT
  vocabulary.
- The observatory imagery helps readers track local knowledge without
  suggesting a global observer.
- The lab controls expose the intended race without turning the page into a
  general network simulator.
- The state inspector, prose, static fallback, and animation agree.
- The custom-element approach remains maintainable after one complete sheet.
- The trace contract can represent MV-register and OR-Set state without
  embedding causal-engine-specific fields in the renderer.

If the trace contract cannot represent those later structures, revise the
contract in the proof repository before designing the Watershed package API.
