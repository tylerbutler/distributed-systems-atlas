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
| Engine | `src/lib/lab/engine-registry.ts` selects an implementation from the scenario's `kind`. Only `dots` is registered, using `causal-engine.ts`. Unavailable kinds fail explicitly. `contract.ts` defines actions, tagged observations, immutable trace views, and errors. Engines own state, messages, partitions, and trace history. |
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

This repository uses a TypeScript reference model and has no Watershed
dependency. Do not import Watershed private build paths or generated
implementation files. A future integration must use a supported public
package API behind the simulation contract. The atlas is a separate
publication, not Watershed product documentation.

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
shapes; ordering engines and Watershed adapters remain separate work.
