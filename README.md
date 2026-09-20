# Distributed Systems Atlas

An illustrated publication for engineers studying distributed systems. You can
follow a learning trail or open a sheet to inspect one mechanism. The articles
assume you can write software and understand common data structures; they do
not assume CRDT vocabulary, Gleam, or Watershed knowledge.

This proof milestone includes the landing page, atlas index, and **Dots and
causal context** sheet with a deterministic browser lab. Other topics have
planned labels rather than placeholder routes. The observatory setting helps
you compare what each replica has observed; it does not imply that a replica
has a global view.

## Local development

Use a Node.js version supported by Astro 7 and the pnpm version in
`package.json` (`pnpm@11.13.1`).

```sh
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

Open the local URL printed by Astro. The published routes are `/`, `/atlas/`,
and `/atlas/dots-and-causal-context/`.

```sh
pnpm verify
```

The verification command runs Astro and TypeScript checks, Vitest unit tests,
Playwright browser tests, and the static Astro build, in that order. It stops
at the first failing stage and writes a successful build to `dist/`. Use the
same command in CI after installing dependencies and Chromium. Linux CI hosts
may need `pnpm exec playwright install --with-deps chromium` to install browser
system dependencies.

For a narrower check, use `pnpm check`, `pnpm test`, or `pnpm test:browser`.
`pnpm build` runs checks, unit tests, and the static build; it omits browser
tests. Playwright starts Astro dev on `127.0.0.1:4321` and can reuse a server
there outside CI. Stop an unrelated server on that port before verification.

To inspect the generated site:

```sh
pnpm exec astro preview --host 127.0.0.1
```

With JavaScript disabled, inspect all three routes. The article, atlas
territories and sheet links, diagrams, initial replica state, bibliography,
and navigation remain available. Lab controls require JavaScript.

## Project boundaries

| Layer | Responsibility |
| --- | --- |
| Content | `src/content/sheets/` contains MDX articles and metadata. `src/content.config.ts` defines the schema; `src/lib/atlas/graph.ts` validates sheet and scenario references. Pages and layouts build the publication and link published sheets. |
| Scenario | `src/lib/lab/scenarios.ts` names the available lessons and returns cloned engine configurations with shared immutable presentation rules. Those rules own lesson controls, labels, comparisons, announcements, and completion criteria. Unknown scenario IDs are errors. A scenario does not maintain a second simulation state. |
| Engine | `src/lib/lab/engine-registry.ts` selects `dots`, `ordering`, `mv-register`, or `or-set` from the scenario's `kind`. `contract.ts` defines actions, tagged observations, immutable trace views, and errors. Atlas owns scheduling, messages, partitions, and trace history. The reference engines own their algorithm state; the register and OR-set adapters use Watershed for state and merges. Unknown kinds fail explicitly. |
| Presentation | `src/lib/lab/present-frame.ts` converts a `TraceFrame` and the scenario's presentation rules into a `PresentedFrame`: typed controls, labeled observation fields, replica shapes, message routes, comparisons, and invariant results. Only history up to the selected frame can supply a lesson conclusion. It does not dispatch actions or change engine state. |
| Renderer | `CausalLab.astro` supplies the lab shell. `TraceFallback.astro` renders the initial frame at build time. `causal-lab-element.ts` handles controls, focus, history selection, and optional animation, using the same frame presentation as the fallback. |

**Labs render from trace frames.** Replica values, clocks, dots, causal
context, messages, inspector records, explanations, and invariant results
come from the selected immutable `TraceFrame`. DOM content and animation
progress are not simulation state. Playback visits recorded frames; it does
not generate actions or deliver queued messages. Reduced motion preserves
the same state and explanations.

The static fallback and live rendering use the same scenario contract:
`scenarioById` supplies the configuration and presentation rules, `createEngine`
selects the engine, and `presentFrame` supplies the presentation. The renderer consumes
`PresentedFrame`; it does not infer algorithm state or decide causal outcomes
from DOM content. Inspectors display immutable trace records directly, without
interpreting engine-private fields.

Observation records use the `observation` tag: `history`, `scalar-clock`,
`vector-clock`, `dots`, `mv-register`, or `or-set`. Each tag has its own typed
metadata. Register siblings retain their individual version vectors, including
equal values with different versions. Set members retain live and removed dots.
The renderer displays labeled fields without requiring Dots metadata on other
observations. Controls are tagged action buttons or notices; action buttons
carry a `LabAction`, not a command parsed from their label.

Each successful non-reset frame records the action as immutable data.
The initial frame has `action: null`; reset returns that same initial frame.
Engines must copy caller-owned data before using `immutable` to freeze a
snapshot. Lesson rules use recorded actions rather than `actionLabel` text.
The contract includes local events, sends, register writes, set adds/removes,
delivery, duplication, partition/heal, and reset. Dots rejects unsupported
actions with `LabError` and leaves its history unchanged.

Engine errors identify the attempted action, engine, and error, and retain
the last valid frame. The renderer must not replace an error with a success
announcement or successful invariant checks. Blocked delivery controls stay
disabled; the browser tests also exercise a stale action against the real
engine to verify its rejection.

The Dots TypeScript model remains a pedagogical reference. The MV-register
and OR-set adapters import the public `@tylerbutler/watershed-atlas` package.
Do not import Watershed private build paths or generated implementation
files. The atlas is a separate publication, not Watershed product documentation.

## Approved design and plans

The design and implementation plans belong to the
[Watershed repository](https://github.com/tylerbutler/watershed). These are
**local-development references** for sibling `distributed-systems-atlas/`
and `watershed/` checkouts; they are not links to a deployed atlas or an
assumed standalone remote:

- [Approved design specification](../watershed/docs/superpowers/specs/2026-09-20-distributed-systems-atlas-design.md)
- [Proof implementation plan](../watershed/docs/superpowers/plans/2026-09-20-distributed-systems-atlas-proof.md)
- [Companion visual implementation plan](../watershed/docs/superpowers/plans/2026-09-20-distributed-systems-atlas-visual-design.md)

The proof plan owns content and simulation behavior. The visual plan owns
the final composition and interaction design, replacing the proof plan's
provisional styling.

The proof milestone is approved. Its teaching sequence, local-knowledge
imagery, focused controls, trace-derived views, and custom-element boundary
meet the design gate. Canonical acceptance data in
`src/lib/lab/fixtures.ts` records the required ordering, clock, Dots,
multi-value register, and observed-remove set results without depending on an
engine or renderer. The shared contract and renderer support those observation
shapes. The Watershed adapters replay the register and OR-set fixtures through
the public package API.

### Watershed adapters

Atlas vendors the reviewed `@tylerbutler/watershed-atlas` 0.1.0 artifact from
Watershed commit `b1ae781` at
`vendor/tylerbutler-watershed-atlas-0.1.0.tgz`. The dependency uses the relative
path `file:vendor/tylerbutler-watershed-atlas-0.1.0.tgz`; no registry release or
Watershed checkout is required. Its SHA-256 is
`7a32902d196bb0811cb71cd6c49f5f09676659788c017c0eab26a4adc47fefed`.
The tarball includes the package's license and third-party notices.

Use `createEngine({ id, kind, replicas, initialValues })` with `kind` set to
`"mv-register"` or `"or-set"`. Register actions use `write`; set actions use `add` and
`remove`. Both support delivery, duplication, partition/heal, and reset.
The shared initial state uses package operations at the first sorted replica
and package merges into its peers. A register accepts at most one distinct
initial value; use concurrent writes to create siblings.

Atlas queues the exact operation returned by the package for each peer.
Delivery calls `merge` with that operation, including for stale or duplicate
messages. Healing only opens a link. Package errors become `LabError` records
with the error tag and diagnostic message; rejected actions retain the last
frame, queue, and history.

The adapters derive visible values and live tags from package state.
For register siblings, Atlas records each authored delta's clock as its birth
version. A merged clock cannot supply that version. For OR-set tombstones,
Atlas retains the authored tag-to-value labels so it can name removed members.
These records support presentation only; the package decides which versions
or additions survive. Reset clears the authored records and rebuilds the seed.
The adapters freeze cloned trace data without freezing caller actions.

OR-set `context` contains per-writer maxima over the live and removed tags in
the displayed state or delta. It is not a vector clock or proof that an entire
prefix has arrived. Watershed emits sparse OR-set deltas; Dots sends its full
observed state. Agreement tests compare their overlapping scenario rather
than asserting identical behavior under other delivery schedules.

Watershed uses a set-wide allocation counter. In the canonical add/remove
fixture, B observes `A:1` and then allocates `B:2`; Dots and the fixture call
B's first addition `B:1`. Traces preserve the package's `B:2`. Agreement tests
check the raw package tags and use an explicit `B:2` to `B:1` correspondence
only when comparing fixture identities. Both retain the concurrent B addition
and reject stale `A:1` replay. Register fixture values compare without display
ordering, while sibling versions and causal context match exactly, including
the intermediate two-sibling checkpoint.

```sh
pnpm test src/lib/lab/adapters src/lib/lab/generalized-contract.test.ts
```

### History, ordering, and clock reference engines

`ordering-engine.ts` implements one deterministic engine family with four
`orderingMode` values: `history`, `partial-order`, `lamport`, and `vector`.
Use `createEngine(scenarioById(id))` for these canonical scenarios:

- `local-history-message-observation`
- `partial-order-comparison`
- `lamport-ordering-concurrency-limit`
- `vector-clock-comparisons`

Each scenario derives its reference actions from `acceptanceFixtures`.
`scenarioTrace(id)` returns the frozen initial frame and reference replay
frames for diagrams and static fallbacks. Live labs use the same scenario
actions and presentation through the existing engine registry. The sheet
content remains a separate task.

History and partial-order sends copy the sender's known events without
creating another local event, as specified by the canonical fixtures. Clock
lessons count sends as events. A receive records a new local event, even
for a duplicate message. Messages retain their send-time payload when later
events occur; partitions block delivery but retain queued messages. Healing
does not deliver messages.

`frame.ordering` records event predecessors and comparison results. Use
`compareEvents` for graph-based causality and `lamportOrder` only for display
sorting by timestamp and replica ID. Unequal scalar timestamps alone cannot
distinguish happens-before from concurrency. Vector receives merge component maxima,
then increment the receiver's component. The inspector shows one component
per configured replica and explains the cost of adding another replica.

The engine extends its ancestor index when it records an event. Immutable
graph snapshots share existing ancestor sets and retain their own event
membership. Comparison and network-only actions reuse the index and invariant
results. `compareEvents` also caches reachability for other fully frozen graphs;
mutable graphs remain uncached so edits cannot produce stale comparisons.

Local, send, and delivery actions accept optional event IDs; send actions
also accept an optional message ID. Canonical replays use fixture IDs.
Free-form actions get deterministic generated IDs. Invalid actions return
`LabError` without changing state or history. Reset clears events, messages,
partitions, comparisons, and counters. Reference traces start with empty
histories; nonempty `initialValues` are rejected.
