# Distributed Systems Atlas Site Design

## Status

Approved for implementation planning.

`Distributed Systems Atlas` is a working title. Naming and domain selection are
separate pre-launch work and do not block the technical plan.

## Goal

Create a standalone educational website for people who want to study
distributed systems in depth. The site will combine illustrated essays with
deterministic browser labs. Readers can inspect replicas, messages, clocks,
causal metadata, and merge results as they work through each concept.

The publication will have its own name, domain, visual identity, repository
boundary, navigation, and editorial model. It will not serve as Watershed
product documentation. Selected labs can run Watershed implementations, with a
small credit and a link to implementation notes.

The first release will teach one connected idea: how distributed systems
represent and preserve concurrency.

## Audience

The primary reader is an engineer who is deliberately studying distributed
systems. The reader can write software and understand common data structures,
but may not know causal ordering, logical clocks, CRDT metadata, or delivery
semantics.

The site must support two reading styles:

- A learner follows a curated trail and builds a mental model in order.
- An experienced engineer opens one sheet as a reference and follows links to
  prerequisites, alternatives, and consequences.

No article will require Gleam or Watershed knowledge.

## Editorial model

The site takes its main inspiration from The Frontendian's long-form technical
essays. Each article begins with a concrete problem, develops the mechanism in
small steps, and uses illustrations as part of the explanation.

The site will not copy The Frontendian's fantasy setting or visual assets. It
will use an original signal-observatory world built around stations, clocks,
transmissions, interference, blind spots, and accumulated observations.

Technical terms stay exact. The visual world supports the explanation but does
not rename vector clocks, dots, causal context, tombstones, replicas, or
partitions.

## Product structure

The main navigation is an atlas with four territories.

### Mechanisms

Mechanisms explain the small ideas that larger algorithms depend on:

- replica and event identity;
- local history and partial order;
- Lamport clocks;
- vector clocks and version vectors;
- dots and causal context;
- tombstones;
- sequence numbers;
- snapshots and compaction.

### Structures

Structures explain replicated data types and their tradeoffs:

- last-writer-wins and multi-value registers;
- grow-only, positive-negative, and operation-based counters;
- grow-only, two-phase, observed-remove, and last-writer-wins sets;
- maps, sequences, trees, and collaborative text;
- ephemeral presence.

### Failure modes

Failure sheets begin with a reproducible bug:

- lost updates;
- duplicate delivery;
- message reordering;
- network partitions;
- clock skew;
- concurrent delete and edit;
- reconnect races;
- unbounded causal metadata.

Each failure sheet links to the mechanisms and structures that cause or prevent
the failure.

### Systems

Systems sheets connect individual mechanisms to larger architectures:

- client-server sequencing;
- peer-to-peer merge;
- anti-entropy;
- membership;
- causal stability;
- consensus boundaries;
- local-first applications.

The first release will expose these territories on the atlas index, but it will
only link completed sheets. Planned topics will use a plain status label rather
than placeholder pages.

## Navigation and learning paths

Cross-links form the curriculum. Each sheet declares:

- required concepts;
- concepts introduced;
- structures that use the concept;
- failure modes caused by misunderstanding it;
- related alternatives;
- research and implementation references.

The atlas supports curated trails without imposing a chapter order. The first
trail is:

1. Local history
2. Partial order
3. Lamport clocks
4. Vector clocks
5. Dots and causal context
6. Multi-value registers
7. Observed-remove sets

A learner can follow this trail from start to finish. A reader who opens the
observed-remove set sheet can move backward to dots or forward to metadata
growth.

## Sheet anatomy

Every substantial atlas entry follows one shared editorial and interaction
pattern.

### The problem

Open with a concrete situation that requires the concept. The vector-clock
sheet starts with three replicas that exchange edits. Wall-clock time and one
scalar logical clock cannot tell whether two events happened in sequence or
concurrently.

### The picture

Introduce one visual model and retain it through the article. Stations
represent replicas. Signals represent messages. Observation cards represent
local histories. Clocks and charts display causal metadata.

The visual model must preserve the algorithm's real distinctions. An
illustration cannot imply a global observer when the system has none.

### The lab

Give the reader a deterministic simulation with these common controls:

- play, pause, step, and reset;
- perform a local operation;
- deliver a selected message;
- reorder queued messages;
- duplicate a message;
- partition or heal a connection;
- inspect one replica or compare all replicas.

Sheets expose only controls that support the lesson. A vector-clock lab does
not need every control used by an anti-entropy lab.

### Under the hood

Reveal internal state in stages. A reader may start with a compact vector such
as `A:2, B:1`, then expand it into component meanings, event relations, dots,
causal context, and merge rules.

Every visible value must come from the current simulation trace. Captions,
diagrams, state tables, and inspectors cannot maintain separate copies of the
same state.

### Break it

Include one incorrect model or implementation when it teaches the subject
better than another explanation. The reader can use wall-clock timestamps,
store a counter as one last-writer-wins value, or discard causal metadata, then
produce the resulting error in the lab.

### What it costs

State the practical price of the technique:

- metadata and storage growth;
- coordination and latency;
- delivery and ordering assumptions;
- garbage collection requirements;
- clock assumptions;
- implementation complexity.

The site must not present convergence as sufficient evidence that a data type
preserves user intent.

### Field notes

End with concise pseudocode, terminology aliases, primary references,
production examples, prerequisites, and neighboring sheets.

## First proof page

The first proof page is **Dots and causal context**.

This topic establishes the site's expected depth and interaction grammar. It
also supports later explanations of observed-remove sets, multi-value
registers, version vectors, delta-state replication, and anti-entropy.

The page begins with two replicas that create concurrent events. The reader
then:

1. identifies each event with a replica and local counter;
2. compares unique event identity with scalar time;
3. groups observed dots into causal context;
4. merges contexts from two replicas;
5. removes an observed dot;
6. creates a concurrent dot that survives the removal;
7. inspects the same state inside an observed-remove set.

The final section links the abstract model to the Watershed-backed OR-Set lab
without making Watershed part of the prerequisite explanation.

## Technical architecture

Use Astro for the content shell. Pages render useful article text, diagrams,
code, citations, and static state tables without client JavaScript. Interactive
labs load as isolated browser components only on sheets that use them.

The design separates article content, scenario data, simulation behavior, and
rendering.

### Content layer

Use a typed content collection for sheets. Each entry includes:

- title, summary, territory, and publication status;
- prerequisites and related sheets;
- concepts introduced;
- bibliography entries;
- lab scenario identifiers;
- editorial content.

Build-time validation rejects missing references, duplicate identifiers,
cycles in the required-reading graph, and links to unpublished sheets unless a
link is marked as planned.

### Scenario layer

A scenario declares:

- replica identities;
- initial state;
- network links and partitions;
- available reader actions;
- queued messages;
- teaching checkpoints;
- expected invariants.

Scenarios use data rather than imperative UI scripts. One scenario can support
the article's initial diagram, the interactive lab, a no-JavaScript state
table, and automated tests.

### Simulation engine

The simulation engine accepts explicit actions:

- local operation;
- message delivery;
- duplicate delivery;
- partition;
- heal;
- logical or wall-clock tick;
- reset.

The engine returns an ordered trace. Each trace frame includes replica state,
messages in flight, causal metadata, emitted events, and an optional
explanation key.

The engine does not render HTML and does not depend on browser timing.

### Engine adapters

An engine-neutral contract allows two implementation sources:

- small reference models for clocks, ordering, and concepts that need direct
  pedagogical control;
- Watershed adapters for supported replicated structures.

Each adapter converts the implementation's state and events into the common
trace format. The article uses general terminology. A disclosure near the lab
names the implementation and links to source notes.

The first release does not need a public plugin system. The internal contract
only needs enough stability to support the reference models and Watershed
adapters.

### Lab renderer

One shared renderer displays:

- replica stations;
- message lanes and queued signals;
- local history;
- clocks and causal context;
- visible value and internal state;
- the ordered event ledger;
- current invariant checks.

The renderer derives its output from the trace. It does not infer algorithm
state from animation progress or DOM state.

Animations explain transitions. Reduced-motion mode shows the same transition
as an immediate before-and-after change with a written event description.

## Data flow

1. The page loads a sheet and its initial scenario.
2. The scenario creates an engine instance through the selected adapter.
3. A reader action becomes one explicit engine action.
4. The engine returns the next trace frame or an explicit error.
5. The lab stores the trace frame in its session history.
6. The renderer updates every view from that frame.
7. The reader can move backward or reset without reconstructing state from the
   DOM.

If scenario state can be serialized safely and compactly, the site may encode
it in a shareable URL. This is optional for the first release.

## Error handling

The build rejects malformed scenarios and invalid sheet references.

At runtime, the lab disables an impossible action and gives a literal reason.
For example, a reader cannot deliver a message across an active partition or
duplicate a message that has not been sent.

An adapter error stops the current action and shows:

- the attempted action;
- the engine or adapter that rejected it;
- the error message;
- the last valid trace frame.

The lab does not reset itself, substitute example output, or display a
successful invariant check after an engine error.

## Accessibility

Every lab operation must work with a keyboard. Controls use plain labels.
Replica state, queued messages, and trace changes have structured text
equivalents.

Color cannot be the only distinction between replicas, message states, causal
relations, or invariant results. Each distinction also uses labels, symbols,
line styles, or position.

The site honors reduced-motion preferences. Readers can pause all automatic
motion. Screen-reader announcements describe completed actions and state
changes without narrating decorative animation.

## First release

The first release includes:

- one standalone landing page;
- one atlas index;
- the seven-sheet concurrency trail;
- the full Dots and causal context proof page;
- shared lab controls and renderer;
- reference-model adapters for ordering and clocks;
- Watershed adapters for the multi-value register and observed-remove set;
- a glossary generated from sheet metadata;
- a bibliography generated from sheet references.

The landing page opens with two stations changing state without observing each
other. It links directly into the first trail and the atlas.

## Success criteria

A learner who completes the first trail can:

- explain why Lamport clocks cannot detect concurrency;
- compare two vector clocks;
- explain what a dot identifies;
- describe the role of causal context;
- predict the merge result of a multi-value register;
- predict add-versus-remove behavior in an observed-remove set;
- reproduce each result in the browser lab.

The implementation meets its technical goals when:

- canonical scenarios produce deterministic traces;
- invariant checks agree with the underlying engine;
- article diagrams and inspectors use the same scenario state;
- labs work by keyboard and remain understandable with reduced motion;
- build-time validation catches broken content references and scenarios;
- runtime errors preserve the last valid state and identify the failed action.

## Testing

Test each canonical scenario as data. Assert the full trace or the relevant
state transitions rather than browser animation timing.

For each algorithm, test:

- local operations;
- concurrent operations;
- reordered delivery;
- duplicate delivery where applicable;
- partitions and healing;
- convergence;
- algorithm-specific invariants;
- adapter agreement with the reference model where both exist.

Add browser tests for keyboard operation, focus order, state inspection,
reduced motion, and visible runtime errors. Use screenshot tests only for
diagrams whose geometry communicates causal or ordering information.

The content build tests metadata references, glossary terms, bibliography
keys, scenario identifiers, and published-link rules.

## Repository and Watershed boundary

Treat the publication as a separate project. Do not put its routes, branding,
or editorial content inside the current Watershed website.

Watershed may provide a package or build artifact that exposes selected pure
kernels to the browser. The new site owns adapters, scenarios, explanations,
and rendering. Watershed owns its algorithms and public behavior.

The site must not import private Watershed build paths. Implementation planning
must define a stable package or artifact boundary before a Watershed-backed lab
ships.

## Non-goals

- Turning the new site into Watershed documentation or marketing.
- Copying The Frontendian's characters, illustrations, or prose.
- Publishing a broad but shallow encyclopedia in the first release.
- Teaching consensus, Raft, Paxos, transactions, sharding, or production
  operations in the first trail.
- User accounts, saved progress, badges, quizzes, comments, or a CMS.
- A public third-party simulation plugin API.
- Requiring JavaScript to read the articles.
- Treating animation as the source of simulation state.
- Claiming that one implementation represents every valid design for a
  concept.
