import * as core from "./build/dev/javascript/atlas_toolkit/atlas_toolkit.mjs";
import * as sluiceCore from "./sluice-runtime.mjs";
import { Result$isOk, Result$Ok$0, type Result as GleamResult } from "./build/dev/javascript/prelude.mjs";

export type Tag = { replicaId: string; counter: number };
export type MvRegister = {
  version: 1; kind: "mv-register"; replicaId: string;
  entries: { tag: Tag; value: string }[]; clock: Tag[];
};
export type OrSet = {
  version: 1; kind: "or-set"; replicaId: string; counter: number;
  entries: { value: string; tags: Tag[] }[]; tombstones: Tag[];
};
export type GCounter = {
  version: 1; kind: "g-counter"; replicaId: string;
  counts: { replicaId: string; count: number }[]; value: number;
};
export type State = MvRegister | OrSet;
export type Operation<S extends State = State> = { version: 1; type: "operation"; delta: S };
export type Change<S extends State = State> = { state: S; operation: Operation<S> };
export type GCounterOperation = { version: 1; type: "g-counter-operation"; delta: GCounter };
export type GCounterChange = { state: GCounter; operation: GCounterOperation };
declare const gCounterRoomBrand: unique symbol;
export type GCounterRoom = { readonly [gCounterRoomBrand]: true };
export type GCounterRoomView = {
  replicas: Array<{ id: "A" | "B" | "C"; value: number }>;
  pending: boolean;
  sequenceNumber: number;
};
export type TransportDelivery = {
  to: string;
  event: string;
  sequenceNumber: number;
  author: string;
};
export type GCounterTransportResult = {
  room: GCounterRoom;
  view: GCounterRoomView;
  deliveries: TransportDelivery[];
};
export type ErrorTag = "invalid-input" | "invalid-state" | "unsupported-version" | "kind-mismatch"
  | "conflicting-tag" | "counter-exhausted";
export type Result<T> = { ok: true; value: T } | { ok: false; error: { tag: ErrorTag; message: string } };

class InputError extends Error {
  readonly tag: ErrorTag;
  constructor(tag: ErrorTag, message: string) {
    super(message);
    this.tag = tag;
  }
}

function attempt<T>(run: () => T): Result<T> {
  try {
    return { ok: true, value: run() };
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    return { ok: false, error: { tag: error.tag, message: error.message } };
  }
}

function requireInput(valid: boolean, message: string, tag: ErrorTag = "invalid-state"): asserts valid {
  if (!valid) throw new InputError(tag, message);
}

const lexical = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const key = (tag: Tag) => JSON.stringify([tag.replicaId, tag.counter]);
const byTag = (a: Tag, b: Tag) => lexical(a.replicaId, b.replicaId) || a.counter - b.counter;

function record(value: unknown): Record<string, unknown> {
  requireInput(value !== null && typeof value === "object" && !Array.isArray(value), "expected a data object");
  requireInput(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null,
    "expected a plain data object");
  requireInput(Object.values(Object.getOwnPropertyDescriptors(value)).every((field) => "value" in field),
    "accessors are not JSON data");
  return value as Record<string, unknown>;
}

function text(value: unknown, tag: ErrorTag = "invalid-state"): string {
  requireInput(typeof value === "string", "expected a string", tag);
  return value;
}

function replica(value: unknown, tag: ErrorTag = "invalid-state"): string {
  const id = text(value, tag);
  requireInput(id.length > 0, "replica ID must be nonempty", tag);
  return id;
}

function counter(value: unknown, minimum = 0): number {
  requireInput(typeof value === "number" && Number.isSafeInteger(value) && value >= minimum,
    "counter must be a nonnegative safe integer");
  return value;
}

function incrementAmount(value: unknown): number {
  requireInput(typeof value === "number" && Number.isSafeInteger(value) && value >= 0,
    "increment must be a nonnegative safe integer", "invalid-input");
  return value;
}

function list<T>(value: unknown, parse: (entry: unknown) => T): T[] {
  requireInput(Array.isArray(value), "expected an array");
  requireInput(Object.values(Object.getOwnPropertyDescriptors(value)).every((field) => "value" in field),
    "accessors are not JSON data");
  return Array.from(value, parse);
}

function tag(value: unknown): Tag {
  const input = record(value);
  return { replicaId: replica(input.replicaId), counter: counter(input.counter, 1) };
}

function tags(value: unknown): Tag[] {
  const entries = list(value, tag).sort(byTag);
  requireInput(new Set(entries.map(key)).size === entries.length, "duplicate tags");
  return entries;
}

function version(value: unknown): void {
  requireInput(value === 1, "only state and operation version 1 is supported", "unsupported-version");
}

function gcounterState(value: unknown): GCounter {
  const input = record(value);
  version(input.version);
  requireInput(input.kind === "g-counter", "expected a G-counter state", "kind-mismatch");
  const replicaId = replica(input.replicaId);
  const counts = list(input.counts, (entry) => {
    const component = record(entry);
    return { replicaId: replica(component.replicaId), count: counter(component.count) };
  }).sort((a, b) => lexical(a.replicaId, b.replicaId));
  requireInput(new Set(counts.map((entry) => entry.replicaId)).size === counts.length,
    "duplicate G-counter components");
  const valueTotal = counts.reduce((sum, entry) => sum + entry.count, 0);
  requireInput(Number.isSafeInteger(valueTotal), "G-counter value exceeds the safe integer range");
  requireInput(counter(input.value) === valueTotal, "G-counter value must equal the sum of its components");
  return { version: 1, kind: "g-counter", replicaId, counts, value: valueTotal };
}

function state(value: unknown): State {
  const input = record(value);
  version(input.version);
  const replicaId = replica(input.replicaId);
  if (input.kind === "mv-register") {
    const clock = list(input.clock, (entry) => {
      const component = record(entry);
      return { replicaId: replica(component.replicaId), counter: counter(component.counter) };
    }).sort(byTag);
    const components = new Map(clock.map((tag) => [tag.replicaId, tag.counter]));
    requireInput(components.size === clock.length, "duplicate clock components");
    const entries = list(input.entries, (entry) => {
      const item = record(entry);
      return { tag: tag(item.tag), value: text(item.value) };
    }).sort((a, b) => byTag(a.tag, b.tag));
    requireInput(new Set(entries.map((entry) => key(entry.tag))).size === entries.length, "duplicate register tags");
    requireInput(entries.every(({ tag }) => components.get(tag.replicaId) === tag.counter),
      "live register tags must match their clock component");
    return { version: 1, kind: "mv-register", replicaId, entries, clock };
  }
  requireInput(input.kind === "or-set", "unknown structure kind");
  const allocation = counter(input.counter);
  const entries = list(input.entries, (entry) => {
    const item = record(entry);
    return { value: text(item.value), tags: tags(item.tags) };
  }).sort((a, b) => lexical(a.value, b.value));
  const tombstones = tags(input.tombstones);
  const live = entries.flatMap((entry) => entry.tags);
  requireInput(new Set(entries.map((entry) => entry.value)).size === entries.length, "duplicate set members");
  requireInput(entries.every((entry) => entry.tags.length > 0), "set members need live tags");
  const known = [...live, ...tombstones];
  requireInput(new Set(known.map(key)).size === known.length, "duplicate or live-and-removed tags");
  requireInput(known.every((tag) => tag.counter <= allocation), "allocation counter does not cover retained tags");
  return { version: 1, kind: "or-set", replicaId, counter: allocation, entries, tombstones };
}

const wireTag = (tag: Tag) => ({ r: tag.replicaId, c: tag.counter });

function kernel<T, E>(result: GleamResult<T, E>): T {
  requireInput(Result$isOk(result), "Watershed rejected the state metadata");
  return Result$Ok$0(result)!;
}

const counterRooms = new WeakMap<GCounterRoom, sluiceCore.GCounterRoom$>();

function roomHandle(value: unknown): sluiceCore.GCounterRoom$ {
  requireInput(
    value !== null && typeof value === "object" && counterRooms.has(value as GCounterRoom),
    "expected a live G-counter Sluice room",
  );
  return counterRooms.get(value as GCounterRoom)!;
}

function roomBox(handle: sluiceCore.GCounterRoom$): GCounterRoom {
  const room = Object.freeze({}) as GCounterRoom;
  counterRooms.set(room, handle);
  return room;
}

function roomView(handle: sluiceCore.GCounterRoom$): GCounterRoomView {
  const snapshot = kernel(sluiceCore.gcounter_room_snapshot(handle));
  return {
    replicas: [
      { id: "A", value: sluiceCore.GCounterRoomSnapshot$GCounterRoomSnapshot$a(snapshot) },
      { id: "B", value: sluiceCore.GCounterRoomSnapshot$GCounterRoomSnapshot$b(snapshot) },
      { id: "C", value: sluiceCore.GCounterRoomSnapshot$GCounterRoomSnapshot$c(snapshot) },
    ],
    pending: sluiceCore.GCounterRoomSnapshot$GCounterRoomSnapshot$pending(snapshot),
    sequenceNumber: sluiceCore.GCounterRoomSnapshot$GCounterRoomSnapshot$sequence_number(snapshot),
  };
}

function transportDeliveries(deliveries: Iterable<sluiceCore.TransportDelivery$>): TransportDelivery[] {
  return Array.from(deliveries, (delivery) => ({
    to: sluiceCore.TransportDelivery$TransportDelivery$to(delivery),
    event: sluiceCore.TransportDelivery$TransportDelivery$event(delivery),
    sequenceNumber: sluiceCore.TransportDelivery$TransportDelivery$sequence_number(delivery),
    author: sluiceCore.TransportDelivery$TransportDelivery$author(delivery),
  })).filter((delivery) => delivery.event === "op");
}

function loadMv(state: MvRegister) {
  return kernel(core.mv_restore(JSON.stringify({
    type: "mv_register", v: 1, state: {
      replica_id: state.replicaId,
      entries: state.entries.map((entry) => ({ tag: wireTag(entry.tag), value: entry.value })),
      vclock: Object.fromEntries(state.clock.map((tag) => [tag.replicaId, tag.counter])),
    },
  }), state.replicaId));
}

function loadSet(state: OrSet) {
  return kernel(core.set_restore(JSON.stringify({
    type: "or_set", v: 1, state: {
      replica_id: state.replicaId, counter: state.counter,
      entries: Object.fromEntries(state.entries.map((entry) => [entry.value, entry.tags.map(wireTag)])),
      tombstones: state.tombstones.map(wireTag),
    },
  }), state.replicaId));
}

function loadGCounter(state: GCounter) {
  return kernel(core.gcounter_restore(JSON.stringify({
    type: "g_counter", v: 1, state: {
      self_id: state.replicaId,
      counts: Object.fromEntries(state.counts.map((entry) => [entry.replicaId, entry.count])),
    },
  }), state.replicaId));
}

const snapshotTag = (tag: core.Tag$): Tag => ({
  replicaId: core.Tag$Tag$replica_id(tag), counter: core.Tag$Tag$counter(tag),
});

function mvState(value: core.Register$, replicaId: string): MvRegister {
  const snapshot = core.mv_snapshot(value);
  return {
    version: 1, kind: "mv-register", replicaId,
    entries: Array.from(core.MvSnapshot$MvSnapshot$entries(snapshot), (entry) => ({
      tag: snapshotTag(core.MvEntry$MvEntry$tag(entry)), value: core.MvEntry$MvEntry$value(entry),
    })).sort((a, b) => byTag(a.tag, b.tag)),
    clock: Array.from(core.MvSnapshot$MvSnapshot$clock(snapshot), snapshotTag).sort(byTag),
  };
}

function setState(value: core.ObservedSet$, replicaId: string): OrSet {
  const snapshot = core.set_snapshot(value);
  return {
    version: 1, kind: "or-set", replicaId, counter: core.SetSnapshot$SetSnapshot$counter(snapshot),
    entries: Array.from(core.SetSnapshot$SetSnapshot$entries(snapshot), (entry) => ({
      value: core.SetEntry$SetEntry$value(entry),
      tags: Array.from(core.SetEntry$SetEntry$tags(entry), snapshotTag).sort(byTag),
    })).filter((entry) => entry.tags.length > 0).sort((a, b) => lexical(a.value, b.value)),
    tombstones: Array.from(core.SetSnapshot$SetSnapshot$tombstones(snapshot), snapshotTag).sort(byTag),
  };
}

function gcounterFromCore(value: core.GrowOnlyCounter$, replicaId: string): GCounter {
  const snapshot = core.gcounter_snapshot(value);
  const counts = Array.from(core.GCounterSnapshot$GCounterSnapshot$counts(snapshot), (entry) => ({
    replicaId: core.CounterEntry$CounterEntry$replica_id(entry),
    count: core.CounterEntry$CounterEntry$count(entry),
  })).sort((a, b) => lexical(a.replicaId, b.replicaId));
  return {
    version: 1,
    kind: "g-counter",
    replicaId,
    counts,
    value: core.GCounterSnapshot$GCounterSnapshot$value(snapshot),
  };
}

export function createGCounterRoom(): Result<GCounterTransportResult> {
  return attempt(() => {
    const handle = kernel(sluiceCore.new_gcounter_room());
    const room = roomBox(handle);
    return { room, view: roomView(handle), deliveries: [] };
  });
}

export function stageGCounterRace(current: unknown): Result<GCounterTransportResult> {
  return attempt(() => {
    const room = current as GCounterRoom;
    const handle = kernel(sluiceCore.gcounter_room_stage_race(roomHandle(room)));
    return { room, view: roomView(handle), deliveries: [] };
  });
}

export function incrementGCounterRoom(
  current: unknown,
  replicaId: unknown,
  amount: unknown,
): Result<GCounterTransportResult> {
  return attempt(() => {
    const room = current as GCounterRoom;
    const replica = text(replicaId, "invalid-input");
    requireInput(replica === "A" || replica === "B" || replica === "C", "replicaId must be A, B, or C");
    const increment = incrementAmount(amount);
    requireInput(increment > 0, "amount must be greater than zero");
    const handle = kernel(sluiceCore.gcounter_room_increment(roomHandle(room), replica, increment));
    return { room, view: roomView(handle), deliveries: [] };
  });
}

export function deliverGCounterRace(current: unknown): Result<GCounterTransportResult> {
  return attempt(() => {
    const room = current as GCounterRoom;
    const [handle, deliveries] = sluiceCore.gcounter_room_deliver(roomHandle(room));
    return { room, view: roomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function deliverOneGCounterOperation(current: unknown): Result<GCounterTransportResult> {
  return attempt(() => {
    const room = current as GCounterRoom;
    const [handle, deliveries] = sluiceCore.gcounter_room_deliver_one(roomHandle(room));
    return { room, view: roomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function resendGCounterComponent(
  current: unknown,
  replicaId: unknown = "B",
): Result<GCounterTransportResult> {
  return attempt(() => {
    const room = current as GCounterRoom;
    const replica = text(replicaId, "invalid-input");
    requireInput(replica === "A" || replica === "B" || replica === "C", "replicaId must be A, B, or C");
    const [handle, deliveries] = kernel(sluiceCore.gcounter_room_resend(roomHandle(room), replica));
    return { room, view: roomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function createGCounter(replicaId: unknown): Result<GCounter> {
  return attempt(() => {
    const id = replica(replicaId, "invalid-input");
    return gcounterFromCore(core.new_gcounter(id), id);
  });
}

export function incrementGCounter(current: unknown, amount: unknown): Result<GCounterChange> {
  return attempt(() => {
    const input = gcounterState(current);
    const delta = incrementAmount(amount);
    const own = input.counts.find((entry) => entry.replicaId === input.replicaId)?.count ?? 0;
    requireInput(own <= Number.MAX_SAFE_INTEGER - delta && input.value <= Number.MAX_SAFE_INTEGER - delta,
      "G-counter value exhausted", "counter-exhausted");
    const [next, operation] = kernel(core.gcounter_increment(loadGCounter(input), delta));
    return {
      state: gcounterFromCore(next, input.replicaId),
      operation: {
        version: 1,
        type: "g-counter-operation",
        delta: gcounterFromCore(operation, input.replicaId),
      },
    };
  });
}

export function mergeGCounter(current: unknown, remote: unknown): Result<GCounter> {
  return attempt(() => {
    const input = gcounterState(current);
    const payload = record(remote);
    if (payload.type === "g-counter-operation") version(payload.version);
    const incoming = gcounterState(payload.type === "g-counter-operation" ? payload.delta : payload);
    return gcounterFromCore(core.gcounter_merge(loadGCounter(input), loadGCounter(incoming)), input.replicaId);
  });
}

export function inspectGCounter(current: unknown): Result<{
  value: number;
  counts: GCounter["counts"];
  causal: GCounter;
}> {
  return attempt(() => {
    const input = gcounterState(current);
    return { value: input.value, counts: input.counts, causal: input };
  });
}

export function createMvRegister(replicaId: unknown): Result<MvRegister> {
  return attempt(() => {
    const id = replica(replicaId, "invalid-input");
    return mvState(core.new_mv(id), id);
  });
}

export function createOrSet(replicaId: unknown): Result<OrSet> {
  return attempt(() => {
    const id = replica(replicaId, "invalid-input");
    return setState(core.new_set(id), id);
  });
}

function change<S extends State>(state: S, delta: S): Change<S> {
  return { state, operation: { version: 1, type: "operation", delta } };
}

export function write(current: unknown, value: unknown): Result<Change<MvRegister>> {
  return attempt(() => {
    const input = state(current);
    requireInput(input.kind === "mv-register", "write requires an MV-register", "kind-mismatch");
    const content = text(value, "invalid-input");
    requireInput((input.clock.find((tag) => tag.replicaId === input.replicaId)?.counter ?? 0) < Number.MAX_SAFE_INTEGER,
      "register counter exhausted", "counter-exhausted");
    const [next, delta] = core.mv_write(loadMv(input), content);
    return change(mvState(next, input.replicaId), mvState(delta, input.replicaId));
  });
}

function editSet(current: unknown, value: unknown, operation: "add" | "remove"): Result<Change<OrSet>> {
  return attempt(() => {
    const input = state(current);
    requireInput(input.kind === "or-set", `${operation} requires an OR-set`, "kind-mismatch");
    const content = text(value, "invalid-input");
    requireInput(operation === "remove" || input.counter < Number.MAX_SAFE_INTEGER, "set counter exhausted", "counter-exhausted");
    const [next, delta] = operation === "add" ? core.set_add(loadSet(input), content) : core.set_remove(loadSet(input), content);
    return change(setState(next, input.replicaId), setState(delta, input.replicaId));
  });
}

export const add = (current: unknown, value: unknown): Result<Change<OrSet>> => editSet(current, value, "add");
export const remove = (current: unknown, value: unknown): Result<Change<OrSet>> => editSet(current, value, "remove");

function taggedValues(input: State): [string, string][] {
  return input.kind === "mv-register"
    ? input.entries.map((entry) => [key(entry.tag), entry.value])
    : input.entries.flatMap((entry) => entry.tags.map((tag): [string, string] => [key(tag), entry.value]));
}

export function merge(current: unknown, remote: unknown): Result<State> {
  return attempt(() => {
    const input = state(current);
    const payload = record(remote);
    if (payload.type === "operation") version(payload.version);
    const incoming = state(payload.type === "operation" ? payload.delta : payload);
    requireInput(input.kind === incoming.kind, "cannot merge different structure kinds", "kind-mismatch");
    const known = new Map(taggedValues(input));
    requireInput(taggedValues(incoming).every(([tag, value]) => !known.has(tag) || known.get(tag) === value),
      "the same tag has different values", "conflicting-tag");
    if (input.kind === "mv-register" && incoming.kind === "mv-register") {
      return mvState(core.mv_merge(loadMv(input), loadMv(incoming)), input.replicaId);
    }
    requireInput(input.kind === "or-set" && incoming.kind === "or-set", "expected OR-set states", "kind-mismatch");
    return setState(core.set_merge(loadSet(input), loadSet(incoming)), input.replicaId);
  });
}

export function inspect(current: unknown): Result<{ values: string[]; causal: State }> {
  return attempt(() => {
    const input = state(current);
    return {
      values: Array.from(input.kind === "mv-register" ? core.mv_values(loadMv(input)) : core.set_values(loadSet(input))).sort(lexical),
      causal: input,
    };
  });
}
