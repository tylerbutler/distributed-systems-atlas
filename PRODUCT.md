# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Engineers studying distributed systems who can write software and understand
common data structures. Readers need no prior knowledge of causal ordering,
CRDT metadata, Gleam, or Watershed. Learners can follow a curated trail;
experienced engineers can open a sheet as a reference.

## Product Purpose

Distributed Systems Atlas is a standalone educational publication combining
illustrated essays with deterministic browser labs. Readers inspect replicas,
messages, clocks, causal metadata, and merge results to understand concurrency.
The seven-sheet release teaches how distributed systems represent and preserve
concurrency. Readers can predict a result, run the reference actions, and
inspect the state that explains it.

## Positioning

Readers compare what separate replicas have observed, then manipulate message
delivery and inspect the resulting trace. Article diagrams, lab records, and
inspectors use the same scenario and trace contract. This publication has its
own repository and editorial model; it is not Watershed product documentation
or marketing.

## Operating Context

Readers can study an article without JavaScript. Interactive labs run in the
browser and let readers perform local operations, control delivery, partition
or heal a connection, and revisit recorded frames. The atlas groups topics
under Mechanisms, Structures, Failure modes, and Systems.

## Capabilities and Constraints

The publication contains the landing page, a structures index, the focused
G-counter, PN-counter, and SharedCounter lessons, atlas index, generated
glossary and bibliography, and all seven sheets in the first concurrency
trail.
Each sheet includes a complete article and a deterministic browser lab.
Unpublished topics retain planned labels without placeholder routes.

The site leads with familiar data structures: counters, sets, registers, maps,
and later structure families. The first complete trail starts with Multi-value
registers and Observed-remove sets, then introduces Dots and causal context,
Local history, Partial order, Lamport clocks, and Vector clocks as the
bookkeeping that explains those structures. Supporting-idea, related-sheet, and
next-step links support both structure-first learning and direct reference.
Published sheet metadata and standalone structure lessons supply glossary
definitions. Sheet metadata also supplies bibliography entries; the build
rejects conflicting entries and broken internal references.

Each structure family has an overview page that compares the structures in
that family. Each implemented structure also has its own lesson page.

The Sets overview follows Counters and places Registers third in the structure
path. A ranger sends Alice, Bob, and Carol along separate trails to survey
beacons in their own field notebooks. Their story moves from a permanent record
of every beacon observed, through an irreversible retirement, to a replacement
beacon that needs a fresh identity. The lessons show each hiker's local members,
addition records, and removal evidence before records merge. The ranger does
not sequence these CRDT updates. The page compares Watershed's GSet, TwoPSet,
and observed-remove set through that progression. Each structure has a
dedicated three-client lesson and focused demo. The observed-remove page also
links to the deeper deterministic lab.

The Registers overview continues the Eagle Creek story with one trail-status
field. LWWRegister selects one timestamped winner, MvRegister preserves
concurrent reports, and RegisterCollection retains sequenced versions for
atomic or latest reads. Each structure has a dedicated three-client demo. The
MvRegister page also links to the deeper causal-context lab.

The Maps overview turns the ranger's field sheet into named shared records.
SharedMap uses server sequence numbers, LWWMap uses per-key timestamps, OR-map
preserves an unseen concurrent tally update, and SharedDirectory gives nested
folders stable identities. Each structure has a dedicated three-client demo
that runs through Watershed's public channel API.

The Sequences overview follows the ordered inspection route into SharedSequence
and SharedText. Stable item and grapheme identities explain why concurrent
inserts can both survive even when local indexes change.

The Coordination overview covers Claims, OrderedCollection, TaskManager, and
PactMap. These structures do not merge several valid answers. They use the
sequencer, queue order, or connected roster to choose one owner, worker,
assignee, or accepted value.

The Transforms overview covers JsonOt and SharedRichText. Their lessons show
how concurrent document operations transform before application so edits to
different paths, text, and formatting can survive together.

Astro renders the content shell and useful initial lab state. Native custom
elements use deterministic TypeScript lesson models for the focused G-counter,
PN-counter, SharedCounter, GSet, TwoPSet, observed-remove set, LWWRegister,
MvRegister, RegisterCollection, SharedMap, LWWMap, OR-map, and SharedDirectory
demos, plus compact rule models for SharedSequence, SharedText, Claims,
OrderedCollection, TaskManager, PactMap, JsonOt, and SharedRichText. Reference
engines cover ordering, clocks, and Dots. Focused structure demos use at least
three clients. Counter, set, register, and map lessons run pinned Watershed
semantics through the site's Gleam toolkit and its stable `@atlas/toolkit` entry
point. Later-family demos model the authored races documented by Watershed's
public examples without importing private build paths.

The G-counter lesson follows Alice, Bob, and Carol as they count birds on
separate hikes and leave cumulative counts at known trail checkpoints.
Each hiker keeps a notebook table with one maximum count per hiker and sums
those rows for the shared total. A worked example shows Carol receiving older
and newer notes in different orders without changing the final result.
Auto-deliver is on by default, so each note reaches the other hikers
immediately. Readers can turn it off to hold several notes, then turn it back on
to share them. The demo animates notes between hikers and checkpoints at a
reader-controlled speed. Guided observations explain pairwise maximum and add
timed callouts and signal-colored marks to the local values and checkpoint.

The PN-counter lesson continues the same hike after the three friends agree on
10 birds. The lesson derives a PN-counter from two G-counters: the positive
counter records sightings, the negative counter records corrections, and the
visible value is `P - N`. Alice records 3 new sightings while Bob corrects 1
duplicate. Their local views briefly show 13, 9, and 10 before Sluice delivers
both notes and all three converge on 12. The article shows that the signed
updates can arrive in either order. Direct controls send each sighting or
correction through Sluice immediately. An explanation disclosure shows the two
G-counter component tables whose difference is the visible count. Each
structure has its own page and a quick-facts label for its family, replication
model, updates, merge rule, delivery behavior, best fit, and metadata cost.

The SharedCounter lesson replaces cumulative checkpoint notes with a ranger's
numbered log. Alice submits `+3` while Bob submits `-1`. The ranger sequencer
assigns consecutive sequence numbers and broadcasts each signed operation.
The lesson distinguishes repeated network delivery from once-only application:
a replica uses the stable sequence number to reject an operation it has
already applied. A static ledger shows `SN 1` for Alice's `+3` and `SN 2` for
Bob's `-1`. Carol misses `SN 1`, detects the gap when `SN 2` arrives, and asks
the ranger to replay the missing operation. The article also names snapshot
recovery as an alternative. The demo continues to deliver every broadcast, so
message loss and recovery remain article-only examples. Direct controls remain
active while earlier notes are in transit.

The internal adapter registry selects Dots, ordering, MV-register, or OR-set
engines from scenario metadata. The lab runtime owns schedules, queues, partitions,
and trace history. The toolkit calls public Watershed kernels at Git commit
`4a8739323ee491f353fcaa8ccfb0488419c1cd43`; those kernels decide local updates
and merge results. The build produces the toolkit's JavaScript and TypeScript
declarations from Gleam source. No sibling checkout or Watershed npm artifact
is required.

Simulation state comes from immutable trace frames, not animation or DOM state.
Runtime errors identify the attempted action and engine while retaining the
last valid frame. Technical terms such as dots, causal context, replicas, and
partitions keep their established meanings.

Accounts, saved progress, badges, quizzes, comments, a CMS, and a public plugin
API are out of scope. The publication name is a working title; final naming
and domain selection remain open pre-launch decisions.

## Brand Commitments

The approved brief pins an original signal-observatory setting: stations,
transmissions, clocks, interference, and partial observations support the
explanation without implying that a replica has global knowledge.

The Frontendian is an editorial reference for long-form technical explanation,
not a source of fantasy imagery, characters, page compositions, or prose.
Watershed's hydrology imagery, survey-sheet identity, and field-atlas naming
do not belong to this publication.

## Evidence on Hand

- `src/content/sheets/`: the seven published trail articles and their primary
  references, including the original Dots proof article.
- `src/lib/lab/`: the reference engine, scenarios, trace contract, presentation,
  and their unit tests.
- `tests/`: browser checks for static content, focused structure-demo and lab
  behavior, accessibility, responsive layouts, generated reference links, and
  article/lab agreement.
- `toolkit/`: focused Gleam tests, facade tests, a generated-declaration check,
  and a Node package smoke test. The release procedure also builds from empty
  Gleam and pnpm caches against the locked Watershed commit.
- `README.md`: shipped routes, development commands, architectural boundaries,
  and links to the approved specification and implementation plans.

## Product Principles

- Teach data structures first, then introduce mechanisms through the concrete
  merge problems they solve.
- Keep partial knowledge explicit; never give a replica a global observer.
- Derive explanatory views from the same trace as the simulation.
- Explain costs and assumptions alongside convergence and conflict semantics.

## Accessibility & Inclusion

Lab operations must work by keyboard. State and trace changes need structured
text equivalents. Labels, shapes, line styles, and position supplement color.
Reduced motion preserves state changes and explanations, and readers can
pause automatic playback. Assistive text stays plain and literal. Core reading
content and the initial lab state remain available without client JavaScript.
Release checks cover focus retention after controls update or disappear,
error recovery without lost records, and identical state under both motion
preferences.
