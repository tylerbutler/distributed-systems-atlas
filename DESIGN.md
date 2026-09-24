---
name: "Distributed Systems Atlas"
description: "A daylit signal observatory for comparing what distributed replicas know."
colors:
  sky-sheet: "oklch(96% 0.025 225)"
  instrument: "oklch(29% 0.075 238)"
  instrument-deep: "oklch(20% 0.055 238)"
  signal: "oklch(84% 0.18 100)"
  interference: "oklch(62% 0.20 28)"
  graphite: "oklch(25% 0.018 250)"
  muted: "oklch(48% 0.025 240)"
  line: "oklch(55% 0.045 230 / 0.34)"
  line-faint: "oklch(55% 0.045 230 / 0.16)"
  clear: "oklch(99% 0.006 220)"
typography:
  display:
    fontFamily: '"Encode Sans Variable", sans-serif'
    fontSize: "clamp(2.5rem, 6vw, 4.5rem)"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-0.025em"
    fontVariation: '"wdth" 82'
  headline:
    fontFamily: '"Encode Sans Variable", sans-serif'
    fontSize: "clamp(1.8rem, 3vw, 2.5rem)"
    fontWeight: 650
    lineHeight: 1.15
    fontVariation: '"wdth" 82'
  title:
    fontFamily: '"Encode Sans Variable", sans-serif'
    fontSize: "1.4rem"
    fontWeight: 650
    lineHeight: 1.15
    fontVariation: '"wdth" 82'
  body:
    fontFamily: '"Roboto Serif Variable", serif'
    fontSize: "clamp(1.05rem, 1rem + 0.2vw, 1.15rem)"
    fontWeight: 400
    lineHeight: 1.68
  label:
    fontFamily: '"Encode Sans Variable", sans-serif'
    fontSize: "0.875rem"
    fontWeight: 500
    lineHeight: 1.5
  entry-action:
    fontFamily: '"Encode Sans Variable", sans-serif'
    fontSize: "clamp(1.05rem, 1rem + 0.2vw, 1.15rem)"
    fontWeight: 650
    lineHeight: 1.68
  lab-control:
    fontFamily: '"Encode Sans Variable", sans-serif'
    fontSize: "clamp(1.05rem, 1rem + 0.2vw, 1.15rem)"
    fontWeight: 400
    lineHeight: 1.4
  data:
    fontFamily: '"Azeret Mono Variable", monospace'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
rounded:
  square: "0"
  round: "50%"
spacing:
  "1": "0.25rem"
  "2": "clamp(0.375rem, 0.3rem + 0.25vw, 0.5rem)"
  "3": "clamp(0.5rem, 0.4rem + 0.5vw, 0.75rem)"
  "4": "clamp(0.75rem, 0.6rem + 0.75vw, 1rem)"
  "5": "clamp(1rem, 0.75rem + 1.25vw, 1.5rem)"
  "6": "clamp(1.5rem, 1rem + 2vw, 2.5rem)"
  "7": "clamp(2rem, 1rem + 4vw, 4rem)"
  "8": "clamp(3rem, 1rem + 8vw, 8rem)"
components:
  trail-entry:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.instrument-deep}"
    typography: "{typography.entry-action}"
    rounded: "{rounded.square}"
    padding: "0.75rem 1rem"
  lab-button:
    backgroundColor: "transparent"
    textColor: "{colors.graphite}"
    typography: "{typography.lab-control}"
    rounded: "{rounded.square}"
    padding: "0.5rem 0.75rem"
    height: "2.75rem"
  lab-button-hover:
    backgroundColor: "{colors.instrument}"
    textColor: "{colors.clear}"
    rounded: "{rounded.square}"
  lab-button-active:
    backgroundColor: "{colors.signal}"
    textColor: "{colors.instrument-deep}"
    rounded: "{rounded.square}"
  instrument-panel:
    backgroundColor: "{colors.instrument}"
    textColor: "{colors.clear}"
    rounded: "{rounded.square}"
  observation-slip:
    backgroundColor: "{colors.sky-sheet}"
    textColor: "{colors.graphite}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "{spacing.2} {spacing.3}"
  comparison-strip:
    backgroundColor: "{colors.instrument}"
    textColor: "{colors.clear}"
    rounded: "{rounded.square}"
    padding: "1rem"
---

# Design System: Distributed Systems Atlas

## Overview

**Creative North Star: "The Daylit Signal Observatory"**

The site draws on an observation room at the start of a shift: cool mineral-blue instruments sit beside white-blue chart stock, sulfur marks identify active signals, and vermilion records interference. The design is precise without becoming a dark network dashboard, and editorial without becoming warm paper theater. Stations, transmissions, clocks, and observation records explain partial knowledge; they never imply that a replica can see the whole system.

The system is dense but calm. Thin rules, aligned records, visible labels, and discrete trace frames make state inspectable. The publication uses persuasive composition only in the landing page's first viewport; atlas and sheet surfaces prioritize reading, comparison, and direct reference.

The emitted direction contract is:

- **THESIS:** Compare partial observations in a daylit signal observatory, refusing the glowing network dashboard.
- **OWN-WORLD:** Mineral-blue instruments, white-blue reading fields, sulfur signals, vermilion interference; square stations and thin ruled records.
- **STORY:** Engineers choose a familiar data structure, observe its merge behavior, then inspect the causal evidence that makes the result possible. Motion snaps between recorded frames.
- **FIRST VIEWPORT:** Navigation and observation rail lead; the landing recommends counters as the first lesson and keeps the full structure index secondary. Sheets open with title, reading context, and prose; the console interrupts below.
- **FORM:** Signal observatory is brief-pinned, overriding roll index 3; seed key `e7ba61a7`.
- **FINISH:** unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

**Key Characteristics:**

- Daylit instrument fields and cool reading stock, with no glow or simulated paper.
- One warm signal role and one vermilion interference role.
- Partial observations shown as local records, never an omniscient system view.
- Flat, square surfaces organized by rules, alignment, station marks, and trace geometry.
- Every live observation view derived from one immutable trace frame.

## Colors

The palette separates reading stock, instrument structure, signal activity, interference, and neutral records. The frontmatter values are the normative source.

### Primary

- **Mineral Instrument:** Navigation bands, station housings, comparison strips, active controls, links, and structural traces.
- **Deep Instrument:** High-contrast instrument edges and text on sulfur signal fields.

### Secondary

- **Sulfur Signal:** Current trace points, published station stops, active recorded frames, traveling signal marks, and the primary entry action.

### Tertiary

- **Vermilion Interference:** Partitions, blocked message routes, failed or dangerous models, and break-it rules.

### Neutral

- **Sky Sheet:** Long-form reading surfaces, chart stock, observation slips, and static diagrams.
- **Graphite:** Default prose and data text on light surfaces.
- **Muted Record:** Secondary status, captions, trail context, and low-priority metadata.
- **Clear Readout:** Text and links on instrument fields.
- **Chart Line / Faint Chart Line:** Boundaries, dividers, trace structure, and the restrained horizontal ruling used only inside chart fields.

### Named Rules

**The Signal Has Meaning Rule.** Use sulfur only for an active transmission, current trace point, published stop, selected frame, station mark, or primary entry action.

**The Interference Is Literal Rule.** Vermilion must accompany explicit fault or invalid-model text and a structural cue such as a broken or dashed line.

**The Redundant Observation Rule.** Color never identifies a station, route state, causal relation, or invariant by itself. Pair it with visible text plus shape, line style, position, or all three.

## Typography

**Display Font:** Encode Sans Variable with a sans-serif fallback

**Body Font:** Roboto Serif Variable with a serif fallback

**Label/Mono Font:** Encode Sans Variable for labels and controls, with separate entry-action and lab-control roles; Azeret Mono Variable for recorded data

**Character:** Condensed Encode Sans gives headings and controls an instrument-panel economy. Roboto Serif keeps explanatory reading open and humane. Azeret Mono is reserved for values whose alignment and identity matter.

### Hierarchy

- **Display** (650, fluid 2.5–4.5rem, 1.15): Landing and page-level statements, balanced to short measures.
- **Headline** (650, fluid 1.8–2.5rem, 1.15): Observation questions and major article sections.
- **Title** (650, 1.4rem, 1.15): Mechanism steps and compact component headings.
- **Body** (400, fluid 1.05–1.15rem, 1.68): Essays and explanations, capped at 68ch.
- **Label** (500, 0.875rem, 1.5): Navigation, statuses, metadata, and observation labels.
- **Entry Action** (650, fluid 1.05–1.15rem, 1.68): Landing entry links; their stronger weight distinguishes the primary route into the trail.
- **Lab Control** (400, fluid 1.05–1.15rem, 1.4): Lab buttons; compact leading keeps multi-line actions legible without giving them label density.
- **Data** (400, 0.875rem, 1.5): Vectors, dots, clocks, message IDs, trace indices, raw state, and pseudocode. Numerals are tabular.

### Named Rules

**The Recorded Value Rule.** Use Azeret Mono only for machine-shaped values and code, never as the main reading voice.

**The Quiet Label Rule.** Use weight and condensed width for hierarchy. Do not default to tracked all-caps labels.

**The Defined Term Rule.** Mark a technical term's first use with an italic
`dfn` link to its glossary entry. Follow it with a term callout that sets the
term in large italic type beside a short definition. On wide reference sheets,
the terms rail replaces duplicate inline callouts.

## Layout

The root content field is 72rem wide with fluid horizontal padding. The landing signal gives one direct entry to Counters and one secondary route to the full structure index. The atlas begins with Structures before connecting to its supporting territories, and sheets use a reading topology rather than repeated cards.

The observation rail persists below primary navigation. Structure pages follow Structures → family → lesson; reference sheets follow Reference atlas → territory → sheet. Family order and lesson order come from the shared structure navigation model, which also supplies the next links and structure index. The seven-sheet trail appears in order on the reference index. The current page and trail position remain text, followed by a thin trace and a sulfur current point. Below 48rem, the rail wraps; the primary navigation stays visible rather than hiding behind a menu.

The territory chart uses a fixed 14rem index column beside connected sheet stops. At 64rem and below, the territory summary moves above the chart field. Below 40rem, connectors simplify into a vertical station list; order and status remain explicit.

Sheets center prose at a 68ch maximum measure. Above 72rem, sticky local contents occupy the left rail, prose occupies the center, and terms occupy the right rail. The observation console breaks across the full sheet, then reading returns to the center measure. At 72rem and below, contents become a disclosure, term notes move inline, figures use available width, and the console remains in document flow.

The console stacks by default, keeps replica stations side by side from 42rem, and changes to a two-thirds observation field plus one-third inspector/ledger at 64.001rem. On narrow screens, message routes become literal source-to-target lists instead of compressed diagrams. Page-level horizontal overflow is not permitted; only labeled raw-state tables may scroll.

Spacing follows the eight-step fluid scale in frontmatter. Use close steps for labels and record internals, middle steps for component grouping, and the largest steps for editorial section changes.

### Named Rules

**The Console Interruption Rule.** Let the lab span the full reading topology only where manipulation becomes necessary; return immediately to the article measure afterward.

**The Reachable History Rule.** Keep prior frames in a visible scrub rail. Do not replace history with an animation that disappears.

## Elevation & Depth

The system is flat. It uses no box shadows, glow, blur, glass, or simulated paper depth. Instrument blue against sky sheet creates tonal layering; one- and two-pixel rules, chart ruling, interrupted routes, and aligned fields create hierarchy. Hover states invert or change fill without lifting the surface.

### Named Rules

**The Flat Observation Rule.** Depth must come from tonal fields, rules, and overlap in the information model, never from decorative shadow.

## Shapes

Corners are square, including buttons, slips, panels, readouts, and the console. Circles are reserved for Station A, station stops, and current trace points. Station B is a diamond with a split lower tick; later stations use a hexagon with repeated side ticks. These geometries always appear with literal station IDs.

Lines carry state. Station A has a solid lower tick; Station B has a split lower tick. Open connections are solid, while dashed routes and a visible break mark blocked delivery or partition state. Thin rules organize records. A two-pixel rule marks a signal-bearing edge; ordinary structure uses one pixel.

Small curved geometry appears only where the territory connector physically turns into the chart and does not establish a rounded-container language.

### Named Rules

**The Station Identity Rule.** Preserve each station's shape, literal ID, tick pattern, and route style together.

**The Square Instrument Rule.** Do not round containers or controls. Round geometry belongs to data-bearing station and trace marks.

## Components

### Entry Actions

- **Shape:** Square, with no shadow.
- **Typography:** Entry Action role: fluid 1.05–1.15rem Encode Sans, weight 650, with 1.68 line-height.
- **Primary:** Sulfur field with deep-instrument text and 0.75rem by 1rem padding.
- **Hover / Focus:** Hover changes the field to Clear Readout; focus uses the context-sensitive three-pixel outline with a four-pixel offset.
- **Secondary:** A text link with generous vertical hit area and a thicker underline on hover.

### Lab Buttons

- **Shape:** Square outline, at least 2.75rem high.
- **Typography:** Lab Control role: fluid 1.05–1.15rem Encode Sans, weight 400, with 1.4 line-height.
- **Default:** Transparent field, current text color, one-pixel current-color border.
- **Hover / Active:** Hover inverts to Mineral Instrument and Clear Readout. Active uses Sulfur Signal and Deep Instrument.
- **Disabled:** Keep the label visible, use a dashed border, and place the literal reason beside or below the control.

### Observation Rail

One broad Mineral Instrument band contains wrapping location text and a separate trace. It is navigation, not decoration: `Atlas`, territory, family, sheet, and trail count remain selectable text, with links on ancestor crumbs. The sulfur endpoint marks current position, while `aria-current` and weight provide redundant state.

### Territory Chart

Each territory is one band with an index, purpose, connected stops, status, and prerequisites. Published stops fill with Sulfur Signal and link to a sheet. Planned stops remain hollow and unlinked with a visible `Planned` label. On mobile, preserve semantic list order and remove curves before reducing text.

### Sheet Reading Topology

The header keeps title, territory, summary, reading time, lab availability, prerequisites, and trail position in the reading field. Local contents and terms become side rails only at wide widths. Break-it sections use a thin vermilion left rule and literal warning copy; cost sections remain dense ledgers rather than alerts; Field notes close quietly under a neutral rule.

### Observation Console

The console anatomy is fixed: lesson controls, replica stations, message lane, vector comparison, trace navigation/history, state inspector, invariant ledger, and status or error. Station records expose visible value, live dots, clock, and causal context. Partitions add `Partition active`, a dashed vermilion route, and a visible break. Errors retain the last valid frame and identify the action, engine, and error.

**The Trace-Derived Presentation Rule.** The scenario creates the engine; the selected immutable `TraceFrame` passes through `presentFrame`; static fallback and live rendering consume that presentation. Captions, controls, replica records, messages, comparison, outcomes, and invariants must not infer algorithm state from DOM classes, animation progress, or a second copy of state.

### Focused Structure Demo

A structure lesson keeps prose within the reading measure and expands only the
sandbox to the instrument width. It uses one broad instrument field with the
merge question, at least three client values, direct controls where the kernel
supports an action, one authored race,
any resolution action needed by the rule, reset, and a literal result sentence.
The familiar value stays larger than its metadata.
Per-user counts, dots, timestamps, or other bookkeeping stay in an
`Explain why` disclosure.

SharedSequence adds a lesson map, Quick facts, and a worked three-notebook
comparison before its sandbox. Alice and Bob insert stops before the same
route stop; Carol observes their local routes and the insertion notes in the
trail exchange. The route readout names Carol's current view until both notes
arrive. The other later-family lessons use the same reading width and dark
instrument field, but keep their own kernel-supported client actions.

The G-counter demo is the first instance. Alice, Bob, and Carol count birds on
separate hikes and leave cumulative notes at known trail checkpoints. Three
separate station records show only their local totals by default, making
temporary disagreement visible before the notes arrive. A compact pill-shaped
known checkpoint sits in the open space between them, shows how many notes
have been left, and keeps a narrow newest-first log beneath it. At wide widths,
generous gaps separate the three clients and checkpoint into a triangle. A new
note leaves its hiker as soon as the reader submits it, then copies fan out to
all three clients. A later outbound note can overlap an earlier return wave.
Sulfur marks new notes; clear marks identify copies traveling to other hikers.
Moving notes are circular and label both the hiker and their unscaled
1000ms network latency.
The article shows Carol's notebook as a table with one maximum count per hiker.
An older Alice note arriving after a newer one leaves Alice's row unchanged,
which makes order-independent merge concrete before the interactive demo.
Client controls can hold several checkpoint notes by turning off
`Auto-deliver`, which is on by default. Turning it back on delivers the queue.
Readers control playback speed. The direct notebook controls are the primary
sandbox path. The authored race is a secondary worked example beneath the
network, and reset returns focus to the first direct notebook control.
An optional `Guided observations` layer explains pairwise maximum and repeated
checkpoint notes with signal-colored `rough-notation` circle and box marks,
using the same annotation library and flash lifecycle as Watershed. The counts
for Alice, Bob, and Carol appear in a ruled table after
disclosure. Structure demos do not inherit the observation console's partition
controls, trace history, raw inspector, or invariant ledger.

The PN-counter demo has its own structure page. It keeps the same three hikers,
checkpoint topology, transport marks, and large local values. The agreed
starting count is 10. Its authored action sends Alice's `+3` sighting note and
Bob's `-1` correction note through Sluice before all three views converge on
12. Manual sightings and corrections travel immediately through the
checkpoint. The visible value stays primary; positive and correction
components appear only in the `Explain why` disclosure. The PN-counter does
not add playback speed, guided observations, or a replay control.

The SharedCounter demo follows the PN-counter lesson but changes the central
mechanism. The middle station is a rectangular ranger sequencer, not a neutral
checkpoint. Unnumbered sulfur notes travel from a hiker to the ranger. The
ranger assigns the next `SN`, records the signed delta in a compact newest-first
log, and sends clear numbered copies to all three replicas. Replica controls
stay active while outbound and broadcast motion overlap. The authored race
uses Alice `+3` and Bob `-1`, with temporary values 13, 9, and 10 before all
three replicas read 12. The explanation disclosure states the once-only
application rule and keeps durable storage outside the demo.

Each structure page places a ruled quick-facts label after its introduction.
The label identifies the structure family, replication model, supported
updates, merge rule, delivery behavior, best fit, and metadata cost.
An original line-art field illustration follows the label. It uses generous
space, a centered notebook or field object, and a small narrative detail to
explain the merge before the interactive instrument.

Each structure family has a top-level comparison page. One ruled section per
structure summarizes its use, merge rule, metadata, and model, then links to
the dedicated lesson page.

The Sets family page uses the same ruled comparison format as Counters. Alice,
Bob, and Carol survey the Eagle Creek trail beacon. The same named beacon moves
through three policies: GSet records that it was ever observed, TwoPSet retires
the name permanently, and the observed-remove set gives a replacement
installation a fresh identity. The family page remains a reading surface; the
three dedicated lesson pages continue that story. Each page uses the same
three-notebook instrument and Watershed Sluice transport while changing the
conflict rule: union for GSet, permanent tombstones for TwoPSet, and observed
addition identities for the observed-remove set. The observed-remove page also
links to the deeper causal-tag lab.

The Registers family uses one Eagle Creek trail-status field to make conflict
policy visible. The same Alice-open and Bob-closed race runs through all three
lessons. LWWRegister shows a timestamp-and-author winner, MvRegister keeps both
alternatives, and RegisterCollection shows atomic and latest reads over the
same retained sequence. Each focused demo keeps Alice, Bob, and Carol visible
and leaves write controls active while records travel.

The Maps family keeps the Eagle Creek field record but changes how each named
entry resolves conflict. SharedMap follows the ranger's sequence, LWWMap
compares per-key timestamps, OR-map preserves Bob's unseen tally update during
Alice's removal, and SharedDirectory resolves concurrent folder creation to
one stable path. The focused demos keep three maps visible and leave direct
controls active while operations travel through the relay.

The Sequences, Coordination, and Transforms families use one compact
three-client instrument. It keeps Alice, Bob, and Carol visible, states the
Watershed rule above the controls, and replaces the shared view after the
authored race. Sequence lessons show stable ordered identity. Coordination
lessons show one accepted owner or value. Transform lessons show both
concurrent document operations in the resulting view. The shared shell avoids
eight nearly identical instruments while each page retains its own story,
rule, operations, and result.

**The Structure-First Demo Rule.** A reader must be able to state the merge
result before opening metadata. Direct structure controls lead when they make
the merge rule understandable through safe exploration. One authored action
must remain available as a worked example that completes the lesson.

### Motion and Reduced Motion

Feedback, state, and trace motion use the shipped 120ms, 220ms, and 420ms
durations with the shared accelerating exit curve. The G-counter transport uses
a 1000ms hop at `1×` so readers can follow each checkpoint note; its speed control
ranges from `¼×` to `2×`. Its 10px transport dots use Watershed's fixed-size
30%-to-100% opacity motion and `ease-in-out` timing. Motion may show a signal
traveling to a queue or destination, a route separating, or a record arriving;
state commits at discrete frames.
The PN-counter and SharedCounter use the same 1000ms Sluice hop and transport
marks at a fixed speed. SharedCounter broadcasts show the assigned sequence
number.

With reduced motion, all animation, transition, and smooth scrolling stop. State changes render immediately with the same status text. Playback becomes `Next recorded frame` and advances once per activation instead of running the 900ms timer.

## Do's and Don'ts

### Do:

- **Do** show each replica's local observation and make the boundary of that knowledge explicit.
- **Do** derive every live label, queue, comparison, inspector value, outcome, and invariant from the selected trace frame.
- **Do** pair color with labels, station geometry, line style, route breaks, or position.
- **Do** preserve article measure, semantic reading order, keyboard-sized controls, and static initial lab content.
- **Do** use chart rules only where they organize real records, paths, or coordinates.

### Don't:

- **Don't** imply a global observer or let animation represent unrecorded intermediate simulation state.
- **Don't** use dark glowing dashboards, neon effects, glass panels, cream-paper editorial styling, gradient blobs, or rounded SaaS cards.
- **Don't** turn atlas territories into equal promotional cards or hide mobile navigation behind a hamburger.
- **Don't** use monospace for prose, generic glyph icons for station identity, or color as the only state cue.
- **Don't** add decorative graph paper to every surface; the ruled field belongs only where observations are being charted.
