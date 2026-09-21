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
Counters lesson, atlas index, generated glossary and bibliography, and all
seven sheets in the first concurrency trail.
Each sheet includes a complete article and a deterministic browser lab.
Unpublished topics retain planned labels without placeholder routes.

The site leads with familiar data structures: counters, registers, sets, maps,
and later structure families. The first complete trail starts with Multi-value
registers and Observed-remove sets, then introduces Dots and causal context,
Local history, Partial order, Lamport clocks, and Vector clocks as the
bookkeeping that explains those structures. Supporting-idea, related-sheet, and
next-step links support both structure-first learning and direct reference.
Published sheet metadata supplies glossary definitions and bibliography
entries; the build rejects conflicting entries and broken internal references.

Astro renders the content shell and useful initial lab state. Native custom
elements use deterministic TypeScript lesson models for the focused G-counter
demo and reference engines for ordering, clocks, and Dots. Focused structure
demos use at least three clients. The G-counter,
multi-value register, and observed-remove set lessons run pinned Watershed
kernels through Atlas's Gleam toolkit and its stable `@atlas/toolkit` entry
point, never private Watershed build paths.

The G-counter lesson uses Watershed's JavaScript Sluice transport. Readers can
play the authored A:+7/B:+3 race and resend the latest cumulative component.
Atlas sequences and delivers the race automatically, animating each operation
from its author through Sluice to all clients at a reader-controlled speed.

The internal adapter registry selects Dots, ordering, MV-register, or OR-set
engines from scenario metadata. Atlas owns schedules, queues, partitions, and
trace history. The toolkit calls public Watershed kernels at Git commit
`4a8739323ee491f353fcaa8ccfb0488419c1cd43`; those kernels decide local updates
and merge results. Atlas builds the toolkit's JavaScript and TypeScript
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
