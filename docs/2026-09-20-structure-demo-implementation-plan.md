# Structure Demo Implementation Plan

> Implement tasks in order. Each task must leave a runnable, tested site.

**Goal:** Replace broad causal consoles on structure pages with focused,
Watershed-backed demos, then expand the publication across all structure
families.

**Specification:** `docs/2026-09-20-structure-first-site-design.md`

**Architecture:** Keep the existing Astro content shell and use Watershed's
JavaScript Sluice for deterministic structure-demo transport. Add a small
structure-demo presentation boundary beside the existing causal-lab boundary.
Each family gets a focused renderer and a short authored scenario. The full
causal console remains available only on mechanism and advanced-reference
pages.

**Technology:** Astro 7, TypeScript, native custom elements, the local
`@atlas/toolkit` Gleam package, Watershed public kernels, Vitest, and
Playwright.

## Global Constraints

- Use Watershed kernels wherever a stable public kernel exists.
- Use `watershed/sluice_js` for structure-demo transport.
- Show at least three clients in every demo.
- Do not import private generated Watershed paths outside `toolkit/index.ts`.
- Keep each default demo to at most three primary actions and six enabled
  controls.
- Keep deterministic authored races. Do not use random delays.
- Render useful initial state and the expected lesson without JavaScript.
- Keep the last valid state visible after an engine error.
- Do not retrofit every structure into the current `CausalLab` renderer.
- Do not add a generic plugin system.
- Do not publish a family until its article, demo, accessibility checks, and
  responsive checks are complete.

## Target Structure

```text
src/
├── components/
│   ├── StructureDemo.astro
│   ├── structure-demos/
│   │   ├── CounterDemo.astro
│   │   ├── RegisterDemo.astro
│   │   ├── SetDemo.astro
│   │   ├── MapDemo.astro
│   │   ├── SequenceDemo.astro
│   │   ├── CoordinationDemo.astro
│   │   ├── TransformDemo.astro
│   │   └── PresenceDemo.astro
├── content/
│   └── structures/
│       ├── counters.mdx
│       ├── registers.mdx
│       ├── sets.mdx
│       ├── maps.mdx
│       ├── sequences.mdx
│       ├── coordination.mdx
│       ├── transforms.mdx
│       └── presence.mdx
├── lib/
│   └── structure-demo/
│       ├── contract.ts
│       ├── scenarios.ts
│       ├── schedule.ts
│       └── *.test.ts
├── pages/
│   ├── structures/
│   │   ├── index.astro
│   │   └── [id].astro
│   └── mechanisms/
│       └── index.astro
└── styles/
    └── structure-demo.css
toolkit/
├── src/atlas_toolkit.gleam
├── index.ts
└── smoke.mjs
tests/
├── structure-demos.spec.ts
├── structure-navigation.spec.ts
└── structure-accessibility.spec.ts
```

Use this as a destination, not mandatory scaffolding. Create a file only when
the task that needs it starts.

## Task 1: Record the New Content Model

**Files:**

- Modify: `src/content.config.ts`
- Modify: `src/lib/atlas/graph.ts`
- Modify: `src/lib/atlas/graph.test.ts`
- Create: `src/lib/atlas/structures.ts`
- Modify: `PRODUCT.md`
- Modify: `README.md`

- [ ] Add a `structure` collection with family, status, summary, merge rule,
  optimistic behavior, engine source, related mechanisms, and demo IDs.
- [ ] Keep the existing `sheet` collection for mechanism and reference pages.
- [ ] Define the family order once: counters, registers, sets, maps, sequences,
  coordination, transforms, presence.
- [ ] Validate duplicate IDs, missing mechanism links, missing demos, and
  published entries that reference planned-only routes.
- [ ] Replace stale causal-first wording in README and the older design status.

**Check:**

```bash
pnpm vitest run src/lib/atlas/graph.test.ts
pnpm check
```

## Task 2: Add the Focused Demo Boundary

**Files:**

- Create: `src/components/StructureDemo.astro`
- Create: `src/lib/structure-demo/contract.ts`
- Create: `src/lib/structure-demo/schedule.ts`
- Create: `src/lib/structure-demo/contract.test.ts`
- Create: `src/styles/structure-demo.css`

- [ ] Define a small frame with replica values, pending state, result text,
  enabled operations, and optional explanation details.
- [ ] Define explicit actions such as `increment`, `write`, `add`, `remove`,
  `edit-key`, `race`, `resolve`, and `reset`.
- [ ] Show compact Sluice pending and delivery state without exposing the
  full causal console, partition controls, trace history, or raw payloads.
- [ ] Let a scenario supply one deterministic race schedule.
- [ ] Render initial values, merge rule, and expected result in static HTML.
- [ ] Use an “Explain why” disclosure for engine metadata.
- [ ] Preserve focus and the last valid frame on errors.

Do not make one renderer responsible for every family-specific value shape.
`StructureDemo.astro` owns the common heading, result, race, reset, error, and
explanation shell. Family components own their familiar controls and values.

**Check:**

```bash
pnpm vitest run src/lib/structure-demo
pnpm check
```

## Task 3: Expand the Watershed Toolkit Boundary

**Files:**

- Modify: `toolkit/src/atlas_toolkit.gleam`
- Create: `toolkit/src/atlas_sluice.gleam`
- Create: typed JavaScript bridge files for the generated Sluice module
- Modify: `toolkit/index.ts`
- Modify: `toolkit/smoke.mjs`
- Modify: `package.json` and `pnpm-lock.yaml` for Watershed's optional
  `phoenix` transport peer
- Add focused Gleam tests under `toolkit/test/`

- [ ] Inventory stable public Watershed kernels for counters, registers, sets,
  maps, sequences, coordination, and transforms.
- [ ] Use `watershed/sluice_js` for each focused demo's deterministic
  multi-client transport.
- [ ] Add one typed facade only when a planned demo needs it.
- [ ] Keep serialized state versioned and validate all decoded values.
- [ ] Preserve Watershed's raw identifiers and metadata in advanced output.
- [ ] Return tagged errors for invalid input and unsupported operations.
- [ ] Add package smoke coverage for each exported family.

Do not expose one universal untyped `dispatch` function. Small family-specific
functions keep the TypeScript boundary readable.

**Check:**

```bash
pnpm toolkit:test
pnpm toolkit:check
pnpm toolkit:smoke
```

## Task 4: Ship Counters as the Entry Lesson

**Watershed references:**

- `../watershed/website/src/pages/structures/counters.astro`
- `../watershed/website/src/components/Demo.astro`:
  `.dds-counter`, `.dds-gcounter`, and `.dds-pn`
- `../watershed/website/src/components/CounterBug.astro`
- `../watershed/website/src/scripts/counter-bug.ts`
- `../watershed/src/watershed/sluice_js.gleam`

**Files:**

- Create: `src/content/structures/counters.mdx`
- Create: `src/components/structure-demos/CounterDemo.astro`
- Add: counter scenario and adapter files under `src/lib/structure-demo/`
- Add: counter unit and browser tests
- Modify: `src/components/LandingSignal.astro`

- [ ] Implement the operation-counter race: A adds 2, B adds 3, result 5.
- [ ] Add a three-client G-counter race through `sluice_js`.
- [ ] Add Watershed-style +1, +3, and +7 controls to every client.
- [ ] Animate each operation through Sluice with playback speed and visual
  jitter controls.
- [ ] Resend the latest cumulative component through Sluice and show that the
  value does not change.
- [ ] Add PN-counter increment/decrement mode.
- [ ] Add the broken counter-in-a-map comparison as a secondary experiment.
- [ ] Keep the first viewport to three client values, a compact Sluice strip,
  direct increments, Race, Deliver, Resend, and Reset.
- [ ] Show signed deltas or per-replica components only under “Explain why.”
- [ ] Replace the landing-page Counters `Planned` label with a route only after
  all checks pass.

**Acceptance:**

- A first-time reader can run the main lesson in one action.
- The page states “both increments survive” before showing metadata.
- Duplicate delivery changes a G-counter exactly once.
- The broken map comparison visibly loses one increment.

## Task 5: Simplify and Publish Registers

**Watershed references:**

- `../watershed/website/src/pages/structures/registers.astro`
- `../watershed/website/src/components/Demo.astro`:
  `.dds-lww-register`, `.dds-mv-register`, and
  `[data-mv-register-resolve]`
- `../watershed/website/src/pages/mv-register.astro`

**Files:**

- Create: `src/content/structures/registers.mdx`
- Create: `src/components/structure-demos/RegisterDemo.astro`
- Reuse: existing MV-register Watershed adapter
- Add: LWW-register toolkit facade if public
- Modify: `src/content/sheets/multi-value-registers.mdx`

- [ ] Present LWW and MV as two answers to the same two-writer race.
- [ ] Use one short revision string per replica.
- [ ] Make Race produce one LWW winner and two MV siblings.
- [ ] Make Resolve replace only the siblings observed by the resolving replica.
- [ ] Move message queues, trace controls, vectors, and raw sibling versions to
  “Explain why” or the existing MV-register reference sheet.
- [ ] Link the family page to Dots and Vector clocks for deeper study.

**Acceptance:**

- The default demo has Write A, Write B, Race, Resolve, and Reset only.
- The visible result distinguishes “one winner” from “both alternatives.”
- The existing Watershed agreement tests remain authoritative.

## Task 6: Simplify and Publish Sets

**Watershed references:**

- `../watershed/website/src/pages/structures/sets.astro`
- `../watershed/website/src/components/Demo.astro`:
  `.dds-gset`, `.dds-twopset`, and `.dds-orset`

**Files:**

- Create: `src/content/structures/sets.mdx`
- Create: `src/components/structure-demos/SetDemo.astro`
- Reuse: existing OR-set Watershed adapter
- Add: G-set and 2P-set toolkit facades if public
- Modify: `src/content/sheets/observed-remove-sets.mdx`

- [ ] Start with G-set union.
- [ ] Show irreversible removal in 2P-set.
- [ ] Show an OR-set add/remove race with one named item.
- [ ] Put stale replay in a secondary experiment.
- [ ] Hide dots, removed tags, and causal context until “Explain why.”
- [ ] Link to Dots and causal context from the explanation.

**Acceptance:**

- The main OR-set result is visible after one Race action.
- “Concurrent add survives” appears without opening metadata.
- Stale replay does not restore an observed removed dot.

## Task 7: Publish Maps

**Watershed references:**

- `../watershed/website/src/pages/structures/maps.astro`
- `../watershed/website/src/components/Demo.astro`:
  `.dds-map`, `.dds-lww-map`, `.dds-ormap`, and
  `.dds-or-map-mv-register`
- `../watershed/website/src/components/DirectoryDemo.astro`
- `../watershed/website/src/scripts/directory-demo.ts`
- `../watershed/website/src/pages/directory.astro`

**Files:**

- Create: `src/content/structures/maps.mdx`
- Create: `src/components/structure-demos/MapDemo.astro`
- Add: Watershed map and OR-map toolkit facades
- Add: map scenario, unit tests, and browser tests

- [ ] Start with two edits to different keys and show both surviving.
- [ ] Add a same-key LWW comparison.
- [ ] Add an OR-map delete/update race.
- [ ] Add nested identity or directory behavior only after the flat-map lessons.
- [ ] Separate key-presence semantics from the value type stored at the key.
- [ ] Use at most two visible keys in the default demo.

**Acceptance:**

- The reader can distinguish different-key merge from same-key conflict.
- The OR-map demo shows a concurrent update surviving deletion.
- Raw key dots and tombstones remain optional.

## Task 8: Build the Structures Hub and Navigation

**Watershed references:**

- `../watershed/website/src/pages/structures/index.astro`
- `../watershed/website/src/components/StructureCategory.astro`
- `../watershed/website/src/data/structures.ts`
- `../watershed/website/src/data/navigation.ts`

**Files:**

- Create: `src/pages/structures/index.astro`
- Create: `src/pages/structures/[id].astro`
- Modify: `src/components/SiteHeader.astro`
- Modify: `src/pages/index.astro`
- Modify: `src/pages/atlas/index.astro`
- Add: navigation and static-content tests

- [ ] Use Watershed's family-first hierarchy: family purpose, included
  structures, publication status, and direct route.
- [ ] Keep Structures first in primary navigation.
- [ ] Show published and planned structures without dead links.
- [ ] Give each family page a short jump list and one focused demo at a time.
- [ ] Keep the atlas index as the full cross-linked reference graph.
- [ ] Add previous-family and next-family navigation.

**Check:**

```bash
pnpm exec playwright test tests/structure-navigation.spec.ts tests/static-content.spec.ts
```

## Task 9: Move the Causal Console to Mechanism Pages

**Files:**

- Create: `src/pages/mechanisms/index.astro`
- Modify: mechanism sheets under `src/content/sheets/`
- Modify: `src/layouts/SheetLayout.astro`
- Modify: structure family pages

- [ ] Keep the existing causal console on Dots, Local history, Partial order,
  Lamport clocks, and Vector clocks.
- [ ] Remove the full console from the default register and set family pages.
- [ ] Add links from each structure's “Explain why” section to the relevant
  mechanism scenario.
- [ ] Allow deep links to an authored causal frame when that can be done
  without encoding engine state in the URL.
- [ ] Rename “Ideas used on this sheet” only if user testing shows that the
  label is unclear.

**Acceptance:**

- Structure demos show no queue, trace rail, invariant ledger, or raw inspector
  before the reader asks for details.
- Mechanism pages retain all existing deterministic trace capabilities.

## Task 10: Publish Sequences

**Watershed references:**

- `../watershed/website/src/pages/structures/sequences.astro`
- `../watershed/website/src/components/SequenceDemo.astro`
- `../watershed/website/src/scripts/sequence-demo.ts`
- `../watershed/website/src/pages/sequence.astro`
- `../watershed/website/src/components/TextDemo.astro`
- `../watershed/website/src/scripts/text-demo.ts`
- `../watershed/website/src/pages/text.astro`

**Files:**

- Create: `src/content/structures/sequences.mdx`
- Create: `src/components/structure-demos/SequenceDemo.astro`
- Add: Watershed sequence and text toolkit facades
- Add: sequence scenarios and tests

- [ ] Implement concurrent insertion at one position.
- [ ] Implement move-versus-edit using stable item identity.
- [ ] Add a short plain-text example after the list example.
- [ ] Keep the visible sequence to five items or fewer.
- [ ] Put raw position identifiers under “Explain why.”

**Acceptance:**

- Both concurrent inserts remain visible in deterministic order.
- An edit follows the item rather than its former numeric index.

## Task 11: Publish Coordination

**Watershed references:**

- `../watershed/website/src/pages/structures/coordination.astro`
- `../watershed/website/src/components/Demo.astro`:
  `.dds-claims`, `.dds-ordered`, `.dds-tasks`, and `.dds-pact`

**Files:**

- Create: `src/content/structures/coordination.mdx`
- Create: `src/components/structure-demos/CoordinationDemo.astro`
- Add: Watershed claim, ordered-work, and pact toolkit facades
- Add: scenarios and tests

- [ ] Show a two-client claim race.
- [ ] Show exclusive task acquisition.
- [ ] Show a proposal remaining pending until required acceptance.
- [ ] Label server sequencing and agreement explicitly.
- [ ] Do not use CRDT terminology for these structures.

**Acceptance:**

- The reader can identify which operations require coordination.
- Pending, won, lost, and accepted states have text labels and live
  announcements.

## Task 12: Publish Transforms and Collaborative Text

**Watershed references:**

- `../watershed/website/src/pages/structures/transforms.astro`
- `../watershed/website/src/components/JsonOtDemo.astro`
- `../watershed/website/src/scripts/json-ot-demo.ts`
- `../watershed/website/src/pages/json-ot.astro`
- `../watershed/website/src/components/RichTextDemo.astro`
- `../watershed/website/src/scripts/rich-text-demo.ts`
- `../watershed/website/src/pages/rich-text.astro`
- `../watershed/website/src/components/TextDemo.astro` for the CRDT
  comparison only

**Files:**

- Create: `src/content/structures/transforms.mdx`
- Create: `src/components/structure-demos/TransformDemo.astro`
- Add: Watershed JSON OT and rich-text toolkit facades
- Add: transform scenarios and tests

- [ ] Start with a small JSON object and two concurrent operations.
- [ ] Add a short rich-text typing/formatting race.
- [ ] Compare OT with the sequence CRDT using the same visible editing task.
- [ ] Keep operation transforms under “Explain why.”
- [ ] Do not build a general editor.

**Acceptance:**

- Both transformed operations are visible in the final JSON result.
- The comparison explains transform versus identity-based merge without
  declaring one model universally better.

## Task 13: Publish Presence

**Watershed references:**

- `../watershed/website/src/pages/guide/presence.astro`
- `../watershed/website/src/pages/runtime/presence.astro`
- `../watershed/website/src/pages/guide/testing.astro` for deterministic
  heartbeat and expiry testing

Watershed has no standalone presence demo to copy. Treat these pages and their
runtime examples as the behavioral source, and design the Atlas demo within the
focused demo contract.

**Files:**

- Create: `src/content/structures/presence.mdx`
- Create: `src/components/structure-demos/PresenceDemo.astro`
- Add: presence scenarios and tests

- [ ] Show cursor movement and disconnect expiry.
- [ ] Show typing state disappearing after a stale interval.
- [ ] State that presence is ephemeral and is not replayed like durable data.
- [ ] Use deterministic virtual time in tests.

**Acceptance:**

- Expired presence disappears without a manual delete operation.
- The page distinguishes freshness from durable convergence.

## Task 14: Add Failure Comparisons

**Files:**

- Add or modify sheets under `src/content/sheets/`
- Reuse focused structure demos in failure mode
- Add browser tests for each broken/correct pair

- [ ] Counter stored in LWW map loses an increment.
- [ ] LWW register hides a concurrent alternative.
- [ ] 2P-set prevents re-add.
- [ ] OR-set without retained context permits stale resurrection.
- [ ] Index-based sequence edits target the wrong item.
- [ ] Presence retained as durable state shows stale users.

Each failure page must run the broken case and the correct structure with the
same visible input.

## Task 15: Finish and Release

**Files:**

- Modify: `README.md`
- Modify: `PRODUCT.md`
- Modify: `DESIGN.md`
- Modify: generated navigation and release tests

- [ ] Remove every stale causal-first route description.
- [ ] Document the published family order and engine provenance.
- [ ] Verify static initial state agrees with the live first frame.
- [ ] Verify every primary demo completes in three actions or fewer.
- [ ] Verify no primary demo exposes more than six enabled controls.
- [ ] Verify keyboard, focus, error recovery, no-JavaScript, reduced-motion,
  responsive layout, and no-overflow behavior.
- [ ] Run the full release command.

```bash
pnpm verify
```

## Delivery Milestones

1. **Core teaching model:** Tasks 1-3.
2. **First useful path:** Counters, registers, sets, and maps; Tasks 4-8.
3. **Mechanism separation:** Task 9.
4. **Expanded structures:** Sequences and coordination; Tasks 10-11.
5. **Documents and ephemeral state:** Transforms and presence; Tasks 12-13.
6. **Failure-mode integration and release:** Tasks 14-15.

Do not start a later milestone while a published demo in the current milestone
still requires the full causal console to explain its primary result.
