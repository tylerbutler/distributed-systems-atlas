# Structure-First Atlas Design

## Status

Proposed. This specification replaces the causal-first curriculum in
`2026-09-20-distributed-systems-atlas-design.md`. The existing seven sheets
remain valid reference material, but their shared causal console is not the
default interaction model for data-structure lessons.

## Decisions

- Cover all planned structure families.
- Use Watershed kernels wherever a stable public kernel exists.
- Keep Atlas-owned scheduling, deterministic traces, and error handling.
- Move the full causal console to mechanism and advanced-reference pages.
- Give each structure a small demo that explains one merge rule.
- Keep the Atlas visual identity. Watershed is the interaction and information
  architecture reference, not the visual design source.

## Watershed Reference

The plan follows these patterns from `../watershed/website`:

- `src/pages/structures/index.astro` leads with structure families rather than
  implementation machinery.
- `src/data/structures.ts` gives each family a plain-language purpose, merge
  rule, optimistic behavior, state summary, and concrete uses.
- `src/components/StructureCategory.astro` keeps the explanation and the demo
  on the same structure plate.
- `src/components/Demo.astro` presents familiar controls on each replica:
  increment a number, write a revision, add or remove an item, or edit a key.
- A visible merge-rule sentence explains what the reader should observe before
  the reader operates the demo.
- Race and reset actions expose the important case without requiring manual
  message scheduling.

The Atlas must not copy Watershed's large all-kernel demo component. Atlas
should reuse its teaching pattern with smaller structure-specific components.

## Job and Audience

An engineer arrives with a familiar programming concept such as a counter,
register, set, map, list, or document. They want to know:

1. What happens when two replicas change it at the same time?
2. Which result is preserved?
3. What guarantee or tradeoff produces that result?
4. Which causal metadata or coordination mechanism is required?

Success means the reader can predict the visible merge result before they need
to read the internal representation.

## Information Architecture

### Primary routes

- `/` — structure-first introduction and recommended sequence.
- `/structures/` — all structure families.
- `/structures/counters/`
- `/structures/registers/`
- `/structures/sets/`
- `/structures/maps/`
- `/structures/sequences/`
- `/structures/coordination/`
- `/structures/transforms/`
- `/structures/presence/`
- `/mechanisms/` — dots, histories, partial order, clocks, causal context,
  sequence numbers, snapshots, and compaction.
- `/failures/` — lost updates, duplicate delivery, reordering, partitions,
  skew, delete/edit races, reconnect races, and metadata growth.
- `/systems/` — sequencing, peer-to-peer merge, anti-entropy, membership,
  causal stability, consensus boundaries, and local-first architecture.
- `/atlas/` — complete cross-linked reference index.

Existing `/atlas/<sheet>/` routes can remain while structure pages are added.
Do not break published links merely to obtain cleaner route names.

### Primary learning sequence

1. Counters
2. Registers
3. Sets
4. Maps
5. Sequences
6. Coordination
7. Transforms
8. Presence

Mechanism links appear at the exact point where a structure needs them. A
reader can follow those links without leaving the structure family permanently.

## Structure Page Anatomy

Each structure page uses the following order:

1. **The value:** show the familiar local data type and its ordinary
   operations.
2. **The race:** state one concurrent-update question in one sentence.
3. **The demo:** show at least three clients with only the controls needed for
   that race.
4. **The result:** state what survives and why in plain language.
5. **Compare rules:** show the nearest alternative, such as LWW versus MV.
6. **Under the hood:** disclose dots, vectors, timestamps, sequence numbers,
   tombstones, or operation transforms.
7. **Failure case:** demonstrate the wrong representation or merge rule.
8. **Costs and limits:** metadata, coordination, ordering, storage, and
   garbage-collection costs.
9. **Related mechanisms:** link to the dedicated causal reference pages.

The result must remain clear when the “Under the hood” disclosure is closed.

## Focused Demo Contract

### Visible by default

- At least three clients, matching Watershed's demo model.
- One value or small collection per replica.
- One or two local operations per replica.
- One named race action.
- Reset.
- A short result sentence.
- A visible distinction between local pending state and converged state when
  the distinction matters.

### Hidden by default

- Raw message payloads and internal runtime records.
- Full delivery queues; show only the compact transport state needed by the
  lesson.
- Partition topology.
- Trace frame navigation.
- Raw engine state.
- Dots, clocks, contexts, tombstones, and sequence numbers.
- Invariant ledgers.

These details belong in an “Explain why” disclosure or a linked mechanism lab.

### Interaction limits

- A first-time reader must be able to complete the primary demonstration in
  three actions or fewer.
- A demo must not show more than six enabled controls at one time.
- The primary result must fit in one sentence.
- Reset must restore the initial state without page reload.
- Race must run a deterministic authored schedule, not random timing.
- A manual mode can exist after the primary demonstration, but it must not
  compete with the main controls.

### Engine boundary

- Use a Watershed kernel for merge semantics when a stable public kernel
  exists.
- Atlas owns the deterministic schedule and converts kernel output to a small
  presentation frame.
- The presentation layer must not infer convergence or conflict semantics.
- Do not expose private Watershed build paths.
- Keep errors visible and preserve the last valid state.

## Demo Specifications

### Counters

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| Operation counter | What happens when A adds 2 and B adds 3? | Add at A, add at B, race | Both increments survive; total is 5 | Signed deltas commute | `website/src/components/Demo.astro` `.dds-counter` |
| G-counter | What happens when clients increment before delivery, then a component is resent? | Add +1/+3/+7 at any client, race A:+7/B:+3, deliver, resend latest | A, B, and C converge; resend changes nothing | Per-replica maxima make merge idempotent | `website/src/components/Demo.astro` `.dds-gcounter`, `website/src/scripts/demo.ts` `localGCounterIncrement`, `src/watershed/sluice_js.gleam` |
| PN-counter | Can replicas increment and decrement offline? | Add at A, subtract at B, race | Final value is positive total minus negative total | Two grow-only components | `website/src/components/Demo.astro` `.dds-pn` |
| Counter in a map | Why not read, increment, and write one number? | Run broken race, run counter race | Map loses one update; counter keeps both | Lost update caused by replacement | `website/src/components/CounterBug.astro` and `website/src/scripts/counter-bug.ts` |

The first counter demo is the entry point for the whole site. It shows a
compact Sluice transport strip with queued state and ordered deliveries. It
animates each operation from its author through Sluice to all clients, with
playback speed and visual jitter controls. It must not show vectors,
partitions, trace history, or raw payloads.

### Registers

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| LWW register | Which concurrent write wins? | Write at A, write at B, race | One deterministic winner | Timestamp and replica-ID tie break | `website/src/components/Demo.astro` `.dds-lww-register` |
| MV register | Can the system avoid inventing a winner? | Write at A, write at B, race | Both values survive | Concurrent versions are incomparable | `website/src/components/Demo.astro` `.dds-mv-register` and `website/src/pages/mv-register.astro` |
| MV resolution | How are siblings replaced safely? | Create race, resolve at A | One combined revision remains | A write replaces only observed versions | `website/src/components/Demo.astro` `[data-mv-register-resolve]` |

The current MV-register engine can remain. Replace the broad console on the
structure page with revision inputs, a race action, and a resolve action.

### Sets

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| G-set | What is the simplest convergent set? | Add at A, add at B, race | Union contains both items | Additions only; union is monotonic | `website/src/components/Demo.astro` `.dds-gset` |
| 2P-set | Why can a removed item not return? | Add, remove, try to add again | Item remains absent | Permanent remove set | `website/src/components/Demo.astro` `.dds-twopset` |
| OR-set | What happens when add races with remove? | Seed item, remove at A, add at B, race | Concurrent add survives | Remove targets only observed dots | `website/src/components/Demo.astro` `.dds-orset` |
| Stale replay | Can an old add resurrect a removed item? | Remove, replay old add | Item stays removed | Causal context remembers the removed dot | `website/src/components/Demo.astro` `.dds-orset`; extend the schedule in Atlas rather than copying the full rig |

The default OR-set demo stops after the add/remove result. Stale replay and raw
tags are a second, optional experiment.

### Maps

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| Independent keys | Do edits to different keys conflict? | Edit key X at A, key Y at B, race | Both keys survive | Keys merge independently | `website/src/components/Demo.astro` `.dds-map` |
| LWW map | What happens when the same key is edited? | Edit one key at A and B, race | One value wins | Per-key winner rule | `website/src/components/Demo.astro` `.dds-lww-map` |
| OR-map | Can a concurrent key update survive deletion? | Delete key at A, update at B, race | Concurrent update keeps the key | Observed-remove key identity | `website/src/components/Demo.astro` `.dds-ormap` and `.dds-or-map-mv-register` |
| Nested map/tree | What survives delete and recreate? | Delete branch, recreate concurrently | Old and new identity do not collapse | Stable node identity and generation | `website/src/components/DirectoryDemo.astro`, `website/src/scripts/directory-demo.ts`, and `website/src/pages/directory.astro` |

The page must distinguish a map's key-presence rule from the value type stored
under each key.

### Sequences

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| Concurrent insert | Where do two inserts at one position land? | Insert at A, insert at B, race | Both items remain in deterministic order | Stable item identities | `website/src/components/SequenceDemo.astro`, `website/src/scripts/sequence-demo.ts`, and `website/src/pages/sequence.astro` |
| Delete and edit | Does an edit follow an item after reordering? | Move at A, edit at B, race | Edit remains attached to the item | Operations target identity, not index | `website/src/components/SequenceDemo.astro` |
| Plain text | What does concurrent typing preserve? | Type at A, type at B, race | Both spans remain | Sequence positions derive from identities | `website/src/components/TextDemo.astro`, `website/src/scripts/text-demo.ts`, and `website/src/pages/text.astro` |

Use short visible strings. Do not begin with a general-purpose document editor.

### Coordination

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| Claim | Who owns one resource after a race? | Claim at A, claim at B, race | One claimant wins | Sequenced first-writer rule | `website/src/components/Demo.astro` `.dds-claims` |
| Ordered work | Who performs the next task? | Enqueue, acquire at A and B | One worker owns the task | Server order and ownership state | `website/src/components/Demo.astro` `.dds-ordered` and `.dds-tasks` |
| Pact | When does a value become active? | Propose, accept | Value remains pending until required acceptance | Agreement before commit | `website/src/components/Demo.astro` `.dds-pact` |

These are not CRDT lessons. Label the coordination boundary explicitly and do
not describe agreement as merge.

### Transforms

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| JSON OT | What happens when two operations target nearby paths? | Edit at A, edit at B, race | Operations are transformed and both apply | Concurrent operations are rewritten | `website/src/components/JsonOtDemo.astro`, `website/src/scripts/json-ot-demo.ts`, and `website/src/pages/json-ot.astro` |
| Rich text OT | Can formatting and typing race safely? | Format at A, type at B, race | Text and attribute intent are retained | Span operations transform | `website/src/components/RichTextDemo.astro`, `website/src/scripts/rich-text-demo.ts`, and `website/src/pages/rich-text.astro` |
| CRDT comparison | How is this different from sequence merge? | Run same text race in both models | Both converge through different mechanisms | Transform versus stable identity | Compare Watershed's `RichTextDemo.astro` with `TextDemo.astro`; do not combine their implementations |

Keep the JSON document and text sample small enough to read without scrolling.

### Presence

| Demo | Question | Primary actions | Result | Explain why | Watershed reference |
|---|---|---|---|---|---|
| Cursor presence | What happens when a client disconnects? | Move cursor, disconnect | Presence expires instead of merging forever | Ephemeral state and leases | No standalone Watershed demo; use `website/src/pages/guide/presence.astro` and `website/src/pages/runtime/presence.astro` as the behavioral source |
| Typing state | Should transient state be replayed? | Start typing, reconnect | Old typing state is discarded | Freshness is more important than convergence | No standalone Watershed demo; use the heartbeat, TTL, and reconnect behavior documented in the same presence pages |

Presence belongs after durable structures because its correct behavior is to
expire, not to retain every update.

## Mechanism Pages

The existing causal console moves to mechanism pages where its controls match
the reader's goal:

- Dots and causal context: event identity, observed removal, stale replay.
- Local history: local events versus delivered knowledge.
- Partial order: before, after, concurrent, and equal.
- Lamport clocks: causal predecessor ordering and false total order.
- Vector clocks: component comparison and concurrency detection.

These pages can keep message delivery, trace history, inspectors, comparisons,
and invariants. Structure pages link to the relevant frame or scenario rather
than embedding the full console.

## Site-Wide Navigation

- Primary navigation: Structures, Mechanisms, Failures, Systems.
- Structures is the default entry and first item.
- Each family page links to the next family and to the mechanisms used.
- Each mechanism page links back to every structure that uses it.
- The atlas index remains the complete graph and expert reference.
- Planned structures show their family, intended question, and status without
  linking to empty routes.

## Accessibility and Responsive Behavior

- Every operation has a visible text label.
- Color never carries pending, converged, winner, removed, or disconnected
  state alone.
- Results announce through a polite live region.
- Focus remains on the initiating control unless the control disappears; then
  it moves to the result heading.
- Reduced motion changes no state or explanation.
- Mobile layouts stack replicas vertically and preserve A-before-B reading
  order.
- The primary race and reset controls remain visible without horizontal
  scrolling.
- Static HTML includes the initial values, the merge rule, and the expected
  result.

## Anti-Goals

- Do not put the complete causal console on every structure page.
- Do not require readers to deliver individual messages to see the main result.
- Do not make raw metadata the largest visual element.
- Do not create one configurable mega-demo component for every family.
- Do not add random timing, nondeterministic races, scoring, quizzes, accounts,
  or saved progress.
- Do not claim that all structures are CRDTs.

## Acceptance Criteria

- Every published structure has one focused default demo.
- Every default demo completes its main lesson in at most three actions.
- A reader can state the merge result without opening “Explain why.”
- Every result comes from the selected Watershed kernel where one is available.
- Counters, registers, sets, and maps are complete before the site promotes
  sequences, coordination, transforms, or presence as published.
- The causal console appears only on mechanism or advanced-reference surfaces.
- Desktop, tablet, mobile, keyboard, no-JavaScript, reduced-motion, and visible
  error states pass release checks.
