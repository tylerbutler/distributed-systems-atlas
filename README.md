# Distributed Systems Atlas

An illustrated publication for engineers studying distributed systems. You can
follow a learning trail or open a sheet to inspect one mechanism. The articles
assume you can write software and understand common data structures; they do
not assume CRDT vocabulary, Gleam, or Watershed knowledge.

The first focused structure lessons use Watershed's G-counter, PN-counter, and
SharedCounter.
Alice, Bob, and Carol count birds on separate hikes and leave cumulative counts
at known trail checkpoints. Each hiker keeps a notebook table with the largest
count received from Alice, Bob, and Carol. Readers can use Auto-deliver or hold
several G-counter notes, leave Alice's and Bob's notes together at an adjustable
speed, and safely repeat a checkpoint note. The next story starts from an
agreed count of 10: Alice records 3 new birds while Bob corrects 1 duplicate,
and all three PN-counter replicas converge on 12. A third lesson sends those
signed changes through a ranger sequencer. It assigns sequence numbers and
broadcasts each operation so every SharedCounter applies it once. Each
structure has its own page and a quick-facts label. The first trail also
contains seven published reference sheets, each with a deterministic browser lab:
Local history, Partial order, Lamport clocks, Vector clocks, Dots and causal
context, Multi-value registers, and Observed-remove sets.
The observatory setting helps you compare what each replica has observed; it
does not imply that a replica has a global view. The release includes the seven
sheets, landing page, structures index, counter-family and set-family pages,
dedicated G-counter, PN-counter, SharedCounter, GSet, TwoPSet,
observed-remove set, LWWRegister, MvRegister, RegisterCollection, SharedMap,
LWWMap, OR-map, SharedDirectory, SharedSequence, SharedText, Claims,
OrderedCollection, TaskManager, PactMap, JsonOt, and SharedRichText lessons,
plus the seven family overview pages, atlas index, glossary, and bibliography.

## Lesson illustrations

[`art/lesson-illustrations.json`](art/lesson-illustrations.json) contains the
pen-and-ink art direction and 35 scene prompts: one for each individual
structure lesson, family overview, and published reference sheet.

All 35 pages now have an authored SVG in their introductions. Open
[`art/counters-and-sets.html`](art/counters-and-sets.html) for the first eight,
or [`art/remaining-lessons.html`](art/remaining-lessons.html) for registers,
maps, sequences, coordination, transforms, and the seven reference sheets.
You can open either preview in a browser without a server. Each image is
self-contained and editable, with no scripts, fonts, or external assets.

The SVGs live in `public/illustrations/lessons/<id>.svg`. Completed catalog
entries have an `asset` path and `alt` text describing the drawing. Each entry
also retains its original scene brief. `artDirection.svgAdaptation` describes
the prop-led treatment of those scenes; precise numerical
examples stay in the lesson text and diagrams.

`src/components/LessonIllustration.astro` reads each asset and its alt text
from the catalog. Explicit image dimensions reserve space before loading, and
the artwork scales to the reading column without client JavaScript. Existing
instructional diagrams and interactive labs remain unchanged.

## Local development

Use a Node.js version supported by Astro 7 and the pnpm version in
`package.json` (`pnpm@11.13.1`). The site also requires Gleam 1.18.1 and Git.
`mise.toml` pins Gleam; use `mise install` or install that version directly.
The first toolkit build fetches its Git and Hex dependencies.

```sh
pnpm install
pnpm exec playwright install chromium
pnpm dev
```

Open the local URL printed by Astro. The publication includes `/`,
`/structures/`, `/structures/models/`, `/structures/counters/`, `/structures/g-counter/`,
`/structures/pn-counter/`, `/structures/shared-counter/`,
`/structures/sets/`, `/structures/g-set/`, `/structures/two-p-set/`,
`/structures/observed-remove-set/`, `/structures/registers/`,
`/structures/lww-register/`, `/structures/multi-value-register/`,
`/structures/register-collection/`, `/structures/maps/`,
`/structures/shared-map/`, `/structures/lww-map/`, `/structures/or-map/`,
`/structures/shared-directory/`, `/structures/sequences/`,
`/structures/shared-sequence/`, `/structures/shared-text/`,
`/structures/coordination/`, `/structures/claims/`,
`/structures/ordered-collection/`, `/structures/task-manager/`,
`/structures/pact-map/`, `/structures/transforms/`, `/structures/json-ot/`,
`/structures/shared-rich-text/`, `/atlas/`, `/glossary/`, `/bibliography/`,
and these sheet routes:

- `/atlas/local-history/`
- `/atlas/partial-order/`
- `/atlas/lamport-clocks/`
- `/atlas/vector-clocks/`
- `/atlas/dots-and-causal-context/`
- `/atlas/multi-value-registers/`
- `/atlas/observed-remove-sets/`

```sh
pnpm verify
```

The verification command builds the Gleam toolkit, checks its generated
declarations and package export, then runs Astro and TypeScript checks,
Gleam and Vitest unit tests, Playwright browser tests, and the static Astro
build, in that order. It stops
at the first failing stage and writes a successful build to `dist/`. Use the
same command in CI after installing dependencies and Chromium. Linux CI hosts
may need `pnpm exec playwright install --with-deps chromium` to install browser
system dependencies.

For a narrower check, use `pnpm check`, `pnpm test`, or `pnpm test:browser`.
`pnpm build` runs checks, unit tests, and the static build; it omits browser
tests. Playwright starts Astro dev on `127.0.0.1:4321` and can reuse a server
there outside CI. Stop an unrelated server on that port before verification.

## Netlify

`pnpm build` compiles the Gleam toolkit, so Netlify must install Gleam before
it runs the build. `netlify.toml` installs `mise`, installs the Gleam version
from `mise.toml`, and runs the build through that tool environment. The publish
directory is `dist`.

### Release checks

Run the toolkit checks without Astro when changing its public boundary:

```sh
pnpm toolkit:build
pnpm toolkit:test
pnpm toolkit:check
pnpm toolkit:smoke
pnpm exec playwright test tests/toolkit.spec.ts
```

`toolkit:check` checks the TypeScript facade and its generated `.d.mts`
dependency graph with `skipLibCheck` disabled. `toolkit:smoke` imports
`@atlas/toolkit` through the workspace package export in Node, without a
bundler or mocks. It checks G-counter and PN-counter convergence, the
SharedCounter sequenced room, register siblings and observed resolution, then
OR-set removal and stale replay with the raw Watershed metadata. The browser
smoke test also rejects
use of clocks, randomness, network, and timers.
Build before running the declaration or package smoke command.

Canonical fixture, engine, presentation, and adapter-agreement tests cover
all seven lessons. Browser tests check their article outcomes and intermediate
states, keyboard focus, static initial records, reduced motion, rejected
actions and recovery, and layouts at mobile and desktop widths. Reference
link tests check page status and fragment IDs. Geometry assertions check
source/target order and arrow direction; release checks do not add decorative
screenshot baselines.

For a release candidate, also build the committed source with an empty Gleam
cache and pnpm store. This checks the exact Git dependency rather than a
prebuilt toolkit or sibling Watershed checkout:

```sh
release=$(mktemp -d)
mkdir "$release/source"
git archive HEAD | tar -x -C "$release/source"
(
  cd "$release/source"
  export XDG_CACHE_HOME="$release/cache"
  pnpm install --frozen-lockfile --store-dir "$release/store"
  pnpm toolkit:build
  pnpm toolkit:test
  pnpm toolkit:check
  pnpm toolkit:smoke
  pnpm build
  git -C toolkit/build/packages/watershed rev-parse HEAD
)
```

The last command must print `4a8739323ee491f353fcaa8ccfb0488419c1cd43`.
Use the installed Gleam 1.18.1 binary if an isolated home prevents a version
manager shim from finding its configuration. No Watershed npm package or
packed tarball is part of this release.

To inspect the generated site:

```sh
pnpm exec astro preview --host 127.0.0.1
```

With JavaScript disabled, inspect the sheet routes. The articles, atlas
territories and sheet links, diagrams, initial replica state, bibliography,
and navigation remain available. Lab controls require JavaScript.

`tests/accessibility.spec.ts`, `tests/trail-content.spec.ts`, and
`tests/responsive.spec.ts` can also run against `astro preview` on port 4321.
Outside CI, Playwright reuses that server to check the built site instead of
starting the development server.

## Generated reference pages

Sheet frontmatter supplies `terms` and `references`; standalone structure
lessons can supply shared terms directly. The graph helpers collect, deduplicate,
and sort published sheet entries. The glossary page combines those terms with
the standalone terms, while the bibliography page uses sheet references.
Sheet sidebars, term callouts, and citations use the same `entryAnchor`
function as those pages. Change the source metadata to change a definition or
reference; there is no separate reference-page catalogue.

The content loader rejects conflicting definitions, conflicting reference
keys, duplicate anchors, missing scenarios, invalid sheet links, and
prerequisite cycles. `firstTrail` fixes the seven-step reading order.
Unpublished topics remain labeled as planned without placeholder routes.

## Project boundaries

| Layer | Responsibility |
| --- | --- |
| Content | `src/content/sheets/` contains MDX articles and metadata. `src/content.config.ts` defines the schema; `src/lib/atlas/graph.ts` validates sheet and scenario references. Pages and layouts build the publication and link published sheets. |
| Scenario | `src/lib/lab/scenarios.ts` names the available lessons and returns cloned engine configurations with shared immutable presentation rules. Those rules own lesson controls, labels, comparisons, announcements, and completion criteria. Unknown scenario IDs are errors. A scenario does not maintain a second simulation state. |
| Engine | `src/lib/lab/engine-registry.ts` selects `dots`, `ordering`, `mv-register`, or `or-set` from the scenario's `kind`. `contract.ts` defines actions, tagged observations, immutable trace views, and errors. The lab runtime owns scheduling, messages, partitions, and trace history. The reference engines own their algorithm state; the register and OR-set adapters use Watershed for state and merges. Unknown kinds fail explicitly. |
| Presentation | `src/lib/lab/present-frame.ts` converts a `TraceFrame` and the scenario's presentation rules into a `PresentedFrame`: typed controls, labeled observation fields, replica shapes, message routes, comparisons, and invariant results. Only history up to the selected frame can supply a lesson conclusion. It does not dispatch actions or change engine state. |
| Renderer | `CausalLab.astro` supplies the lab shell. `TraceFallback.astro` renders the initial frame at build time. `causal-lab-element.ts` handles controls, focus, history selection, and optional animation, using the same frame presentation as the fallback. |
| Focused structure demos | `src/lib/structure-demo/` owns small deterministic lesson models. Each structure component renders useful static state and adds only the controls required for its rule. Structure demos use at least three clients. The G-counter, PN-counter, and SharedCounter lessons add per-client updates and animated delivery over the real `watershed/sluice_js` transport without using the broad causal console. |

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
and OR-set adapters import the local `@atlas/toolkit` workspace package.
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

### Gleam toolkit and Watershed adapters

`toolkit/` is the site's JavaScript-target Gleam package. Its `gleam.toml` enables
TypeScript declarations and depends
on Watershed through Git:

```toml
watershed = { git = "https://github.com/tylerbutler/watershed", ref = "4a8739323ee491f353fcaa8ccfb0488419c1cd43" }
```

Commit `toolkit/manifest.toml` when updating dependencies. It locks the Git
commit and transitive Git/Hex versions. There is no npm Watershed dependency,
vendored tarball, or sibling-checkout requirement.

`toolkit/src/atlas_toolkit.gleam` calls the public
`watershed/g_counter_kernel`, `watershed/pn_counter_kernel`, `watershed/sluice_js`,
`watershed/mv_register_kernel`, and `watershed/or_set_kernel` modules. Its
opaque handles keep kernel types inside the toolkit. It uses the ack-free
operations and public summaries; no transport or runtime actor is involved.
New Gleam examples can use this module without depending on the lab engine.

`toolkit/index.ts` is the stable `@atlas/toolkit` export. It converts native
Gleam records into plain JSON data, validates imported metadata, prevents
unsafe JavaScript counter increments, and returns tagged errors. It exposes
`createGCounter`, `incrementGCounter`, `mergeGCounter`, `inspectGCounter`,
`createPNCounter`, `updatePNCounter`, `mergePNCounter`, `inspectPNCounter`,
`createMvRegister`, `createOrSet`, `write`, `add`, `remove`, `merge`, and
`inspect`, plus their state/result types. State and operation records use
version 1. Only the toolkit entry point imports its generated JavaScript;
application code does not import generated Watershed files. The Gleam kernels
make all local-operation and merge decisions.

`pnpm dev`, `pnpm check`, and `pnpm test:browser` build the toolkit first.
`pnpm test` runs Gleam tests before Vitest. `pnpm build` and `pnpm verify`
include these steps. Generated JavaScript and declarations in
`toolkit/build/` are ignored and rebuilt from source:

```sh
pnpm toolkit:build
pnpm toolkit:test
```

The internal adapter registry has four engine kinds: `dots`, `ordering`,
`mv-register`, and `or-set`. The ordering kind has history, partial-order,
Lamport, and vector modes. Seven scenarios select these implementations;
neither the MDX sheets nor the shared renderer select a Watershed module.
This registry is internal code, not a public plugin API.

Use `createEngine({ id, kind, replicas, initialValues })` with `kind` set to
`"mv-register"` or `"or-set"`. Register actions use `write`; set actions use `add` and
`remove`. Both support delivery, duplication, partition/heal, and reset.
The shared initial state uses package operations at the first sorted replica
and package merges into its peers. A register accepts at most one distinct
initial value; use concurrent writes to create siblings.

The adapter queues the exact operation returned by the package for each peer.
Delivery calls `merge` with that operation, including for stale or duplicate
messages. Healing only opens a link. Toolkit errors become `LabError` records
with the error tag and diagnostic message; rejected actions retain the last
frame, queue, and history.

The adapters derive visible values and live tags from package state.
For register siblings, the adapter records each authored delta's clock as its birth
version. A merged clock cannot supply that version. For OR-set tombstones,
The adapter retains the authored tag-to-value labels so it can name removed members.
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
actions and presentation through the existing engine registry. The four
clock and ordering sheets describe those reference steps and their exact
intermediate states.

The structure sheets use `mv-register-concurrent-writes-observed-resolution`
and `or-set-concurrent-add-remove-stale-replay`. Their numbered reference
controls preserve the canonical action sequence; their conclusion requires
that reference history and the final metadata. Free-form controls also permit
other experiments. The articles distinguish selected vector inputs from
station clocks, and Watershed's `B:2` tag from the Dots model's `B:1`.

`tests/trail-content.spec.ts` checks the six new articles, static initial
states, mobile and desktop reference runs, and intermediate sibling and
replay checkpoints. The shared graph validator checks prerequisites,
related sheets, scenario IDs, glossary terms, and reference metadata.

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

Reference-step controls require the complete recorded action prefix to match
the reference trace. After a deviation, reset is required to resume the guided
run; matching a later reference action does not restore it. Historical frames
remain read-only.
