# Structure Demo Implementation Plan

## Status

Initially reconciled against shipped code on 2026-10-15, at commit `3e1b4ce`;
updated below as the documentation, validation, and teaching work shipped.
This document replaces the original unchecked implementation checklist.
It records shipped behavior, changes to the proposed design, and remaining
work. It does not certify technical correctness or a new release check.

**Goal:** Teach distributed structures through focused, three-client demos,
with the full causal console available in deeper reference articles.

**Original specification:** [Structure-first site design](2026-09-20-structure-first-site-design.md).
That specification describes the proposal, not the current route catalogue.

Status terms:

- **Shipped:** The capability and supporting code are present.
- **Shipped with changes:** The teaching goal is present, but the implementation
  differs from the original task.
- **Partial:** Some requirements remain unmet.
- **Not started:** No dedicated implementation is present.

## Shipped Architecture

- Astro pages contain the structure articles. There is no `structure` content
  collection. Reference articles use the existing `sheet` MDX collection.
- `src/lib/structure-demo/structure-navigation.ts` defines six families in this
  order: Counters, Sets, Registers, Maps, Sequences, Coordination.
- JsonOt belongs to Maps; RichTextOt belongs to Sequences. Neither Transforms
  nor Presence has a separate family route.
- Family overview pages link to 21 individual structure lessons.
  `src/pages/structures/[structure].astro` generates eight of those lessons;
  the others have dedicated page files.
- `StructureLessonLayout.astro` shares article layout and related-reference
  links. Structure-specific components share transport controls and styles,
  rather than one universal `StructureDemo.astro` frame.
- `@atlas/toolkit` is the application boundary for real Watershed kernels.
  `toolkit/src/atlas_sluice.gleam` uses `watershed/sluice_js` for counters,
  sets, and maps. Registers use kernels through `atlas_toolkit.gleam`.
  Sequences, coordination, and OT use kernels and explicit authored queues
  through `atlas_remaining_structures.gleam`, not Sluice transport.
- `/atlas/` groups reference articles by topic. Mechanisms, Failure modes,
  and Systems are reference territories, not separate top-level route hubs.
  Empty territories do not appear in the main article list.
- `/labs/g-counter/` and `/labs/shared-counter/` provide live rooms backed
  by Cloudflare Durable Objects. Local teaching demos remain separate.

The target file tree and mandatory task order from the original plan are
retired. Use the existing components and routes for further work.

## Task 1: Record the New Content Model

**Status: Shipped with changes.**

The `sheet` collection remains in `src/content.config.ts`. Structure pages
and typed navigation data replace the proposed `structure` collection.
The catalogue order is Counters, Sets, Registers, Maps, Sequences,
Coordination, not the original eight-family order.

Sheet validation covers duplicate IDs, missing references and scenarios,
explicit links to planned articles, and prerequisite cycles. The schema also
rejects unknown `structureLessons` slugs. These checks do not constitute the
proposed structure-collection validator, because that collection was not added.

**Evidence:** `src/content.config.ts`, `src/lib/atlas/graph.ts`,
`src/lib/atlas/graph.test.ts`, `tests/static-content.spec.ts`.

Documentation reconciliation remains under Task 15.

## Task 2: Add the Focused Demo Boundary

**Status: Shipped with changes; interaction contract revised.**

Dedicated counter, set, register, map, sequence, queue, task, agreement, and
JSON components render three clients, authored examples, results, and static
initial content. Native custom elements add interaction. Error paths retain
the last valid state.

Shared code includes `DemoTransportControls.astro`,
`src/lib/structure-demo/demo-operation-flight.ts`, and
`src/styles/structure-demo-shell.css`. There is no universal frame/action
contract or generic plugin system.

The shipped UI exposes notebook evidence, operation logs, and transport
controls directly. It does not put all metadata behind an "Explain why"
disclosure. The global six-control cap is retired: preserve useful per-client
sandbox controls. Primary guided examples must reach their stated result in
at most three user actions from fresh/reset default state. Waiting, Reset
itself, live-room setup, and optional exploration do not count.
`tests/structure-demo-contract.spec.ts` derives its catalogue from the shipped
navigation and measures the primary flow on every individual lesson.
The comparison specs measure their shared guided flows.

**Evidence:** `src/components/GCounterDemo.astro`,
`src/components/RemainingStructureDemo.astro`,
`tests/g-counter-demo.spec.ts`, `tests/remaining-structure-demos.spec.ts`.

## Task 3: Expand the Watershed Toolkit Boundary

**Status: Partial; kernels shipped across all implemented families.**

The stable `toolkit/index.ts` entry point exposes typed facades with tagged
errors. Serialized counter, register, and set state has version checks and
input validation. Opaque room handles keep generated kernel types out of
application code. Typed bridge files and the `phoenix` dependency are present.
Later-family demos call real public kernels, not standalone TypeScript rule
models.

The original requirement to use `sluice_js` for every focused demo is only
partly implemented. Register and later-family transport follows the separate
paths described above.

`toolkit/smoke.mjs` exercises counters, sets, registers, maps, and all eight
later-family kinds through the public package entry. It checks concrete
three-client initial/final states and sequence numbers, including queue
release/completion, task promotion, and pact signoff/roster lifecycles.
It also exercises the new move/edit and matched-text facades in both
eligible delivery orders.

**Evidence:** `toolkit/index.ts`, `toolkit/remaining-structures.js`,
`toolkit/remaining-structures.d.ts`,
`toolkit/src/atlas_toolkit.gleam`, `toolkit/src/atlas_sluice.gleam`,
`toolkit/src/atlas_remaining_structures.gleam`, `toolkit/test/`,
`toolkit/smoke.mjs`, `tests/toolkit.spec.ts`.

## Task 4: Ship Counters as the Entry Lesson

**Status: Shipped with changes.**

The counter overview links to dedicated G-counter, PN-counter, and
SharedCounter lessons. G-counter has per-client +1, +3, and +7 controls,
cumulative-state delivery, safe resend, speed controls, and visual jitter.
Its authored race is Alice +7 and Bob +3, converging on 10.
PN-counter starts at 10 and races +3 against -1, converging on 12.
SharedCounter teaches numbered signed operations with the same +3/-1 race.

These separate pages replace the proposed combined counter demo and its
initial +2/+3 example. The G-counter lesson also runs the same +7/+3 inputs
through an LWW map of whole totals and a real G-counter. The map keeps 3 while
the counter keeps 10; repeating Bob's cumulative note leaves 10 unchanged.

**Evidence:** `src/pages/structures/counters.astro`,
`src/lib/structure-demo/g-counter.ts`, `src/lib/structure-demo/pn-counter.ts`,
`src/lib/structure-demo/shared-counter.ts`,
`tests/g-counter-demo.spec.ts`, `tests/pn-counter-demo.spec.ts`,
`tests/shared-counter-demo.spec.ts`.

## Task 5: Simplify and Publish Registers

**Status: Shipped with changes.**

The family overview links to LWWRegister, MvRegister, and RegisterMap lessons.
Each has a three-client demo. The LWW/MV examples race two trail-status
reports; RegisterMap also demonstrates atomic versus latest reads and a
caught-up write.

MvRegister resolution is explained in the article and is available through
ordinary writes after delivery and the linked causal reference lab. There is
no dedicated Resolve button. The LWWRegister lesson adds a paired experiment
using the same trail reports: one LWW winner versus two native MV siblings.
The original five-button layout was not adopted.

**Evidence:** `src/components/RegisterStructureDemo.astro`,
`src/lib/structure-demo/register-demo.ts`,
`src/pages/structures/multi-value-register.astro`,
`tests/register-demos.spec.ts`, `src/lib/lab/adapters/watershed-agreement.test.ts`.

## Task 6: Simplify and Publish Sets

**Status: Shipped with changes.**

GSet, TwoPSet, and observed-remove set each have a lesson and three-client
demo. The progression covers union, irreversible removal, and a concurrent
addition surviving an observed removal.

The TwoPSet lesson compares a fresh add after an observed removal with the
OR-set policy. The OR-set lesson replays the exact original addition against
a native OR-set and a labeled membership-only toy that discards removal
evidence. The toy resurrects the old beacon; the kernel does not.
Addition IDs and removal evidence are visible in notebook views,
not restricted to an optional metadata disclosure.

**Evidence:** `src/pages/structures/sets.astro`,
`src/components/SetStructureDemo.astro`,
`tests/set-demos.spec.ts`, `toolkit/smoke.mjs`,
`src/content/sheets/observed-remove-sets.mdx`.

## Task 7: Publish Maps

**Status: Shipped with changes.**

SharedMap, LWWMap, OR-map, and SharedDirectory have dedicated three-client
lessons. They cover different-key edits, same-key selection, a concurrent
update surviving removal, and stable directory identity. The Maps overview
also includes JsonOt, following the later data-shape grouping.

**Evidence:** `src/pages/structures/maps.astro`,
`src/components/MapStructureDemo.astro`,
`src/lib/structure-demo/map-demo.ts`, `tests/map-demos.spec.ts`.

## Task 8: Build the Structures Hub and Navigation

**Status: Shipped with changes.**

Structures leads primary navigation. The hub and six family overviews link
to published lessons. The reference atlas links articles, helpful background,
and related structure lessons. Planned articles, when present in the
collection, appear without placeholder page links.

The site deliberately supports free browsing, not a prescribed learning
sequence. Lesson endings link to their family, the catalogue, and related
references. Previous-family/next-family navigation was not adopted.

**Evidence:** `src/components/SiteHeader.astro`,
`src/lib/structure-demo/structure-navigation.ts`,
`src/components/StructureLessonLayout.astro`,
`tests/navigation.spec.ts`, `tests/static-content.spec.ts`.

## Task 9: Move the Causal Console to Mechanism Pages

**Status: Shipped with changes; frame deep links remain absent.**

Focused structure lessons do not embed the broad causal console. The five
mechanism sheets and deeper MV-register and OR-set sheets retain their labs
at `/atlas/<id>/`. Related-reference links connect lessons to those articles.
The proposed `/mechanisms/` hub was not added.

Recorded frames can be selected inside a lab. There is no URL-based authored
frame selection. The UI now uses "Helpful background" for optional reference
links.

**Evidence:** `src/content/sheets/`, `src/layouts/SheetLayout.astro`,
`src/lib/lab/causal-lab-element.ts`, `tests/ordering-lab.spec.ts`,
`tests/dots-lab.spec.ts`, `tests/static-content.spec.ts`.

## Task 10: Publish Sequences

**Status: Shipped with changes.**

SequenceCrdt and TextCrdt lessons use real kernels, stable identities, direct
editing controls, and deterministic concurrent-insertion examples. The
SequenceCrdt race ends with five items. The sequence family also contains
RichTextOt.

The move/edit experiment composes SequenceCrdt application record IDs with
native LWW-map fields. Alice moves Weir while Bob marks that ID blocked from
the original view. Both delivery orders retain the field target in all three
native copies. A labeled stale-index toy blocks Bridge instead at Alice.
Native move preserves item identity; replacement is not used to simulate a
field edit. The existing insertion sandbox remains intact.

**Evidence:** `src/pages/structures/sequences.astro`,
`src/components/RemainingStructureDemo.astro`,
`src/components/SequenceMoveComparison.astro`,
`toolkit/src/atlas_teaching_comparisons.gleam`,
`tests/teaching-comparisons.spec.ts`,
`toolkit/src/atlas_remaining_structures.gleam`,
`tests/remaining-structure-demos.spec.ts`.

## Task 11: Publish Coordination

**Status: Shipped with changes.**

Claims, FifoWorkQueue, TaskManager, and PactMap have dedicated lessons and
real-kernel demos. They show write-once claims, exclusive work acquisition,
release/completion, volunteer promotion on disconnect, and a proposal waiting
for its frozen signer roster. The articles distinguish sequenced DDS
operations from CRDT merge.

**Evidence:** `src/pages/structures/coordination.astro`,
`src/components/FifoWorkQueueDemo.astro`,
`src/components/TaskManagerDemo.astro`, `src/components/PactMapDemo.astro`,
`tests/remaining-structure-demos.spec.ts`.

## Task 12: Publish Transforms and Collaborative Text

**Status: Shipped with changes.**

JsonOt demonstrates concurrent same-index list insertions and a nested
numeric update. RichTextOt demonstrates concurrent formatting and insertion.
Both run public Watershed kernels.

OT is grouped by data shape: JsonOt under Maps and RichTextOt under Sequences.
The former `/structures/transforms/` address redirects to the structure
catalogue; it has no family overview. `/structures/models/` compares
CRDT, DDS, and OT mechanisms. The TextCrdt lesson runs the same initial
sentence and concurrent inserts through TextCrdt and RichTextOt. It shows real
grapheme identities, OT references and transformed operations. Each path
converges in either delivery order; matching cross-model word order is not
required. The existing formatting race and raw-offset counterexample remain.

**Evidence:** `src/components/JsonOtDemo.astro`,
`src/pages/structures/[structure].astro`,
`src/pages/structures/models.astro`,
`src/components/TextMechanismComparison.astro`,
`toolkit/src/atlas_teaching_comparisons.gleam`,
`toolkit/teaching-comparisons.test.ts`,
`tests/teaching-comparisons.spec.ts`,
`toolkit/src/atlas_remaining_structures.gleam`,
`tests/remaining-structure-demos.spec.ts`.

## Task 13: Publish Presence

**Status: Not started as a teaching family.**

- [ ] Add a dedicated article and focused demo for cursor movement,
  disconnect expiry, and typing-state expiry.
- [ ] Explain ephemeral freshness versus durable replicated state.
- [ ] Cover heartbeat and expiry behavior with deterministic virtual time.

Live rooms already display connection presence through `worker/sluice.ts`
and `DemoRoomControls.astro`. That runtime feature does not fulfill the
planned teaching lesson. There is no Presence family or lesson route.

## Task 14: Add Failure Comparisons

**Status: Partial.**

The TextCrdt lesson has a working raw-offset counterexample beside its
identity-based kernel demo. Browser coverage checks divergence and the effect
of reversing arrival order. Existing reference labs and lessons also explain
lost alternatives, irreversible removal, and retained causal context.

Comparisons live inside existing lessons rather than in new failure-mode
articles. The remaining comparison depends on the unbuilt Presence lesson:

- [x] Counter in an LWW map loses an increment.
- [x] LWW selection versus retaining concurrent register alternatives, with
  matched visible input.
- [x] TwoPSet re-add restriction versus a structure that permits re-add.
- [x] OR-set without retained context versus correct stale-replay handling.
- [x] Index-based sequence targeting versus stable-ID targeting for a moved
  record and a concurrent field edit.
- [ ] Durable presence shows stale users versus expiring presence.

Do not count article explanations alone as completed paired experiments.

**Evidence:** `src/components/NaiveTextMergeDemo.astro`,
`src/components/PolicyComparison.astro`,
`src/components/SequenceMoveComparison.astro`,
`src/lib/structure-demo/policy-comparisons.test.ts`,
`tests/policy-comparisons.spec.ts`,
`src/pages/structures/[structure].astro`,
`tests/remaining-structure-demos.spec.ts`, `src/content/sheets/`.

## Task 15: Finish and Release

**Status: Partial; verification infrastructure shipped.**

`pnpm verify` builds and checks the toolkit, checks the Worker and Astro
types, runs Gleam and Vitest tests, runs Playwright, then builds the static
site. Browser suites cover no-JavaScript content, keyboard use, focus,
visible errors, reduced motion, responsive layout, and overflow.

Test presence is not proof that every original acceptance requirement is met.
The catalogue audit compares semantic replica values, initial metadata, and
reset state with JavaScript disabled and after enhancement. It caught and
fixed RegisterMap empty-state copy, FIFO numbering and empty-work state, and
TextCrdt's pending-edit label. Each lesson's authored result is checked from
default state; the six paired experiments have their own guided contracts.
`pnpm verify` completed after these changes, including the native and
TypeScript checks, unit and browser suites, and the static build. This does
not replace the technical correctness review below.

- [ ] Complete technical correctness review. Reference articles and labs
  still carry the default "Not yet reviewed for correctness" warning.
  `showCorrectnessWarning: false` controls visibility, not review status.
- [x] Replace the global six-control cap with the approved guided-example
  contract above.
- [x] Measure each primary guided example against the three-action contract.
- [x] Audit static/live/reset initial-state agreement across all 21 lessons
  and the six new comparisons, including relevant metadata.
- [x] Update stale publication descriptions in `README.md` and `PRODUCT.md`,
  including family counts, retired Transforms routes, actual live-room
  behavior, and public-kernel provenance for later-family demos.
- [x] Run `pnpm verify` after the selected changes are complete.

**Evidence:** `package.json`, `tests/accessibility.spec.ts`,
`tests/responsive.spec.ts`, the family browser suites,
`tests/structure-demo-contract.spec.ts`, `tests/policy-comparisons.spec.ts`,
`tests/teaching-comparisons.spec.ts`,
`tests/correctness-warning.spec.ts`, `src/components/CorrectnessWarning.astro`.

## Work Shipped Beyond the Original Plan

- G-counter live rooms broadcast cumulative state and merge it optimistically
  through the native kernel.
- SharedCounter live rooms use Durable Object sequencing, signed operations,
  persistent history, duplicate protection, and gap recovery.
- `worker/sluice.ts` shares room connection, role, presence, and broadcast
  plumbing without replacing each structure's synchronization mechanism.
- One multiplayer architecture reference explains both live demos.
- Lesson introductions have authored SVG illustrations.
- Lessons link to related reference sheets. The glossary has alphabetical
  jumps, and the reference atlas uses article rows with linked background.

**Evidence:** `worker/`, `src/pages/labs/[counter].astro`,
`tests/g-counter-room.spec.ts`, `tests/shared-counter-room.spec.ts`,
`src/content/sheets/multiplayer-rooms.mdx`, `tests/lesson-illustrations.spec.ts`,
`src/pages/glossary.astro`, `src/pages/atlas/index.astro`.

## Remaining Work Summary

The original plan is not a queue of 15 unfinished tasks. The structure
catalogue and most teaching demos have shipped.

The remaining planned scope is Presence and its stale-user comparison,
authored-frame deep links, transport consistency, and technical correctness
review. The documentation, non-Presence comparisons, package smoke expansion,
initial-state audit, and guided-action measurements are implemented.
These remaining gaps have no new priority order or deadline assigned.
