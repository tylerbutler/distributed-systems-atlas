# Presence Lessons Design

## Scope and status

Agreed scope: a Presence family overview and two focused lessons. This document
defines the teaching and implementation contracts; it does not publish routes
or mark the remaining Presence work complete.

Presence follows Coordination in the structure catalogue. Explain that this
family covers transient collaboration signals, rather than another durable
CRDT or sequenced document structure.

| Proposed route | Title | Complexity |
| --- | --- | --- |
| `/structures/presence/` | Presence | Introductory |
| `/structures/presence-roster/` | Who is still here? | Intermediate |
| `/structures/typing-state/` | Is Alice still typing? | Intermediate |

Use the existing family navigation and lesson layout. Do not create a new
content collection, reference territory, or live room. Keep these routes
unpublished until their articles and working demos ship.

## Story and learning goals

Alice, Bob, and Carol inspect the Eagle Creek trail map and write field notes.
Their saved notes must survive a disconnect. Their current map markers and
typing indicators describe recent activity.

Readers should be able to:

- Choose a lifetime for shared information before choosing its storage.
- Distinguish connection-backed membership from heartbeat-based estimates.
- Explain why a connected person can have an expired activity indicator.
- Separate a person, a session, and a document's durable state.
- Describe what a late joiner or reconnecting client can recover.

Use glossary links and visible definition callouts at first use. Add shared
definitions for presence, session, heartbeat, time-to-live, and ripple through
the existing standalone-term mechanism. Reuse existing definitions where they
already exist. Do not define presence as authentication, a lock, or proof that
a person is looking at the screen.

## Overview: choose what should survive

Open with four facts from the same field survey:

| Information | Intended lifetime | Teaching model |
| --- | --- | --- |
| Bob's saved field note | Survives absence and reload | Durable document state |
| Alice's connected session | Until departure detection or expiry | Presence roster |
| Carol's cursor position | A recent position while her session is present | Raw ripple plus roster-based cleanup |
| Alice's typing indicator | Until typing stops or the activity timeout passes | Low-frequency status with an application timeout |

Explain that Watershed carries transient traffic outside the document's
operation stream. It does not store or replay ripple messages. A server
presence snapshot supplies the current roster, not a history of activity.

Introduce the two roster modes without requiring readers to configure them:

- Server mode tracks sessions through connections. The server removes an
  entry after it detects the connection's departure. A late joiner receives
  a roster snapshot.
- Ripple mode announces metadata through heartbeats. Each receiver expires
  sessions it has not heard from within its local liveness window. A late
  joiner waits for announcements.

Explain `Auto` in supporting API notes. The native driver resolves its mode
from the handshake and does not silently switch a resolved Server handle to
Ripple on reconnect. Forced Server mode reports `UnsupportedPresence` when
the server lacks the capability.

## Lesson 1: Who is still here?

### Opening and primary result

Alice marks the creek crossing on the shared map. Bob and Carol can see her
session. Alice then loses her connection without sending a departure message.
Readers predict whether Bob should keep showing her as present.

The primary paired experiment compares a deliberately misused durable map
with native Ripple presence. Both receive the same initial session
announcement and the same loss of further messages from Alice.

Fresh state has three connected sessions and synchronized initial rosters.
Alice's last received announcement has virtual timestamp zero.

1. **Lose Alice's connection.** Stop her outbound announcements without sending
   a leave. Bob and Carol remain connected and continue heartbeats.
2. **Advance 8 seconds.** Run scheduled work and deliver eligible messages.

At the end, Bob's and Carol's durable maps still contain Alice's last record.
Their Ripple rosters contain Bob and Carol only. Label the durable path
**Durable map used as presence: deliberate failure model**. Use an existing
native map facade; its retained entry demonstrates a missing application
lifetime policy, not a defect in map convergence.

Keep the primary comparison visible. Put server-mode timing and detailed
evidence below it so readers do not have to compare three full demos at once.

### Server-mode experiment

Use the same three hikers and a separate native Server-mode run:

1. **Lose Alice's connection.** Represent loss of traffic without yet claiming
   that the server has detected the failure.
2. **Detect closed connection.** Deliver the modeled transport-close event.

Show Bob and Carol receiving the server's leave diff without a browser TTL.
Label the interval before detection as uncertain. Do not imply that a server
detects a broken network immediately.

### Timing and evidence

Use Watershed's pinned defaults: heartbeat every 2,000 ms, TTL 6,500 ms.
The pure expiry function retains a session at exactly the TTL and removes it
only when its age exceeds the TTL.

Distinguish the eligibility threshold from the driver's next expiry check.
An entry does not disappear at 6,501 ms unless scheduled code checks then.
Verify the 8-second guided result against the actual native scheduler rather
than calculating UI state from a countdown.

For each observer show its roster, selected mode, virtual time, last received
announcement, and received/expired/left evidence. Label diagnostic timestamps
as Atlas instrumentation when the public roster does not expose them.
Do not display one global roster as though all observers share its knowledge.

### Optional exploration

Allow readers to delay an announcement, advance time, and then deliver it.
The native Ripple model can show that session again: receipt refreshes
`last_seen`. Explain that expiry means no recent received evidence, not a
permanent removal or a trustworthy sender timestamp.

Offer labeled map positions as keyboard-operable cursor controls. Send
positions through raw ripples and remove a remote marker when its owning
session leaves that observer's roster. Do not add a third cursor lesson or
claim that raw ripples provide ordering or replay.

## Lesson 2: Is Alice still typing?

### Opening and primary result

Alice starts a field note, then pauses to inspect the trail. Her connection
remains healthy. Bob and Carol should stop seeing a typing indicator without
removing Alice from their rosters.

Use low-frequency typing status in presence metadata. Do not send each
keystroke through presence; high-frequency cursor movement stays on raw
ripples. The lesson demonstrates an Atlas application policy composed with
native membership and metadata updates.

Fresh state has three connected sessions, Ripple mode, virtual time zero,
and `typing: false` for each session. Atlas uses a 3,000 ms inactivity timeout,
an authored teaching choice rather than a Watershed default.

1. **Start Alice typing.** Set her metadata to `typing: true` and arm the
   inactivity timeout. Native Ripple delivery publishes it on a heartbeat.
2. **Advance 4 seconds.** Run intermediate timers and message delivery. Bob and
   Carol first observe the typing status, then receive `typing: false` after
   Alice's inactivity timeout and subsequent heartbeat. Her session remains.
3. **Reconnect Alice.** Complete a labeled simulated disconnect and rejoin
   with fresh session identity and `typing: false`. No old typing action
   returns, and Bob and Carol stay present.

Keep a readable event record of the intermediate typing state even when one
advance action runs several timers. The guided result must not depend on
animation speed or require a reader to catch a brief visual change.

### Application freshness policy

On fresh typing input, replace the inactivity timer. On timeout, update the
native metadata to `typing: false`. On disconnect, clear local activity and
cancel its timer; clear the handle's metadata before rejoin, or start its
replacement with `typing: false`.

This cleanup is required: the native JavaScript driver retains its latest
metadata and sends it again on reconnect. Absence of historical message replay
does not prevent an application from republishing a stale current value.

Do not buffer typing actions for offline replay. The timeout measures recent
input, while the roster TTL measures received membership evidence.

Ripple status updates wait for a heartbeat. A remote indicator can therefore
remain visible after the sender's inactivity deadline until the update arrives.
Do not present the application timeout as a universal remote deadline. If the
sender disappears before clearing its status, observer-side roster expiry
removes its indicator.

Provide optional exploration for a lost connection while typing and repeated
input that extends the inactivity deadline. Do not promise reliable activity
delivery on the non-sequenced ripple lane.

## Native implementation boundary

Use the existing `@atlas/toolkit` entry point. Add a typed presence facade
following the toolkit's opaque handles, input checks, and explicit error
results. Application components must not import generated build paths.

Prefer native `presence_js.start_with_scheduler` with `sluice_js.scheduler`
for both modes, rather than reconstructing the driver in TypeScript.
The pinned Sluice supports server presence; `disable_presence` before
connecting lets tests exercise Auto fallback. Explicit modes keep the
primary demonstrations stable and legible.

Relevant public APIs include:

- `watershed/presence`: configuration, mode selection, roster entries,
  session grouping, and pure roster transitions.
- `watershed/presence_js`: `start_with_scheduler`, `update`, `stop`, `mode`,
  and `local_session`.
- `watershed/sluice_js`: connections, delivery controls, logical time,
  scheduler, and presence capability controls.

Keep Atlas code responsible for authored actions, activity timers, evidence,
and presentation. Let native code determine roster membership and metadata
updates. Do not sequence presence as document operations or call it P2P.

An authored **Advance** action must visit intermediate timer deadlines and
deliver eligible messages between steps. Sluice's `advance` moves its clock
before firing due callbacks; one large native jump does not simulate each
missed heartbeat at its original deadline. Drive the native scheduler in
bounded chronological steps so a healthy peer does not expire as an artifact
of the teaching control.

After reconnect in Ripple mode, a receiver can retain the old session until
its TTL expires while also showing the new session under the same person key.
Label those sessions instead of forcing one entry per person. The typing
primary flow clears activity before reconnect, so neither session should
revive an old typing indicator.

Implement the smallest facade and demo components needed for these lessons;
do not introduce a generic ephemeral-state framework. Show native failures
through the existing visible-error pattern without inventing empty rosters
as success-shaped fallbacks.

## Publication and acceptance criteria

Wire the seventh family and both lessons through structure navigation, index
cards, related-sheet links, glossary aggregation, and catalogue-driven tests.
Update README and PRODUCT counts only when the pages ship. Link both lessons
to the multiplayer architecture sheet, and link back from that sheet while
preserving its description of the existing live rooms.

Before publication, verify:

- Native three-client initial state agrees with static HTML, enhancement,
  and Reset. Reset cancels old timers and pending deliveries.
- Each primary guided result takes at most three user actions from defaults.
  The embedded failure comparison has its own measured guided contract.
- Bob and Carol expire Alice independently; both retain healthy peers.
  Unit tests cover TTL minus one, exact TTL, and TTL plus one, while driver
  tests cover actual scheduled expiry and delayed-announcement reappearance.
- Server snapshots, leave diffs, late join, reconnect identity, two sessions
  sharing a person key, and unsupported Server mode follow native behavior.
- Typing timeout does not remove membership; repeated input extends the
  timeout; disappearance removes the indicator; reconnect does not republish
  stale typing metadata. No old timer can update a replacement session.
- Cursor cleanup follows local roster membership. No raw ripple enters
  durable state or an offline activity replay queue.
- Articles work without JavaScript. Controls have visible labels and
  keyboard operation. Status and event evidence do not depend on color,
  motion, pointer position, or a real-time wait.
- Targeted toolkit, unit, browser, and catalogue tests pass before the
  repository's existing `pnpm verify` release check.

Keep technical correctness review separate from implementation checks.
Do not hide review warnings to imply review completion.

## Related gaps and exclusions

This design covers implementation-plan Task 13 and the stale-user comparison
in Task 14. It does not close the separate authored-frame deep-link,
transport-consistency, or technical-review gaps.

The existing Worker rooms count open WebSockets and assign hiker roles to
connections. They do not implement the full native presence lane described
here. Leave their behavior unchanged in this work. Production reconnect,
authorization, heartbeat policy, and participant identity require separate
runtime decisions.

No new live multiplayer presence lab, offline outbox, cursor interpolation,
cross-device clock synchronization, or general failure-detector article is
required for these two lessons.

## Sources

Behavioral baseline: Watershed revision
`4a8739323ee491f353fcaa8ccfb0488419c1cd43`, pinned in `toolkit/gleam.toml`.

- [Pure presence model](https://github.com/tylerbutler/watershed/blob/4a8739323ee491f353fcaa8ccfb0488419c1cd43/src/watershed/presence.gleam)
- [JavaScript presence driver](https://github.com/tylerbutler/watershed/blob/4a8739323ee491f353fcaa8ccfb0488419c1cd43/src/watershed/presence_js.gleam)
- [Sluice driver and virtual scheduler](https://github.com/tylerbutler/watershed/blob/4a8739323ee491f353fcaa8ccfb0488419c1cd43/src/watershed/sluice_js.gleam)

The upstream guide and runtime pages informed the initial investigation.
Published implementation sections should cite the public APIs Atlas uses,
not upstream demo implementations.
