import * as core from "./build/dev/javascript/atlas_toolkit/atlas_toolkit.mjs";
import * as sluiceCore from "./sluice-runtime.mjs";
import { Result$isOk, Result$Ok$0, type Result as GleamResult } from "./build/dev/javascript/prelude.mjs";

// Gleam emits $replica instead of $replica_id in lattice_registers declarations.
declare global {
  namespace $replica {
    type ReplicaId$ = import("./build/dev/javascript/lattice_core/lattice_core/replica_id.mjs").ReplicaId$;
  }
}

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
export type PNCounter = {
  version: 1; kind: "pn-counter"; replicaId: string;
  positive: { replicaId: string; count: number }[];
  negative: { replicaId: string; count: number }[];
  value: number;
};
export type State = MvRegister | OrSet;
export type Operation<S extends State = State> = { version: 1; type: "operation"; delta: S };
export type Change<S extends State = State> = { state: S; operation: Operation<S> };
export type GCounterOperation = { version: 1; type: "g-counter-operation"; delta: GCounter };
export type GCounterChange = { state: GCounter; operation: GCounterOperation };
export type PNCounterOperation = { version: 1; type: "pn-counter-operation"; delta: PNCounter };
export type PNCounterChange = { state: PNCounter; operation: PNCounterOperation };
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
declare const pnCounterRoomBrand: unique symbol;
export type PNCounterRoom = { readonly [pnCounterRoomBrand]: true };
export type PNCounterRoomView = {
  replicas: Array<{ id: "A" | "B" | "C"; value: number }>;
  pending: boolean;
  sequenceNumber: number;
};
export type PNCounterTransportResult = {
  room: PNCounterRoom;
  view: PNCounterRoomView;
  deliveries: TransportDelivery[];
};
declare const sharedCounterRoomBrand: unique symbol;
export type SharedCounterRoom = { readonly [sharedCounterRoomBrand]: true };
export type SharedCounterRoomView = PNCounterRoomView;
export type SharedCounterTransportResult = {
  room: SharedCounterRoom;
  view: SharedCounterRoomView;
  deliveries: TransportDelivery[];
};
export type SetRoomKind = "g-set" | "two-p-set" | "or-set";
export type SetRoomAction = "add" | "remove";
declare const setRoomBrand: unique symbol;
export type SetRoom = { readonly [setRoomBrand]: true };
export type SetRoomView = {
  replicas: Array<{ id: "A" | "B" | "C"; values: string[] }>;
  pending: boolean;
  sequenceNumber: number;
};
export type SetTransportResult = {
  room: SetRoom;
  view: SetRoomView;
  deliveries: TransportDelivery[];
};
export type RegisterDemoKind = "lww-register" | "mv-register" | "register-collection";
declare const registerDemoRoomBrand: unique symbol;
export type RegisterDemoRoom = { readonly [registerDemoRoomBrand]: true };
export type RegisterDemoView = {
  replicas: Array<{ id: "A" | "B" | "C"; values: string[] }>;
  pending: number;
  sequenceNumber: number;
  winnerAuthor: string;
  timestamp: number;
  atomicValue: string;
  latestValue: string;
  versions: string[];
};
export type RegisterDemoResult = {
  room: RegisterDemoRoom;
  view: RegisterDemoView;
};
export type MapRoomKind = "shared-map" | "lww-map" | "or-map" | "shared-directory";
export type MapRoomAction = "set" | "remove" | "increment" | "mkdir" | "rmdir";
declare const mapRoomBrand: unique symbol;
export type MapRoom = { readonly [mapRoomBrand]: true };
export type MapRoomView = {
  replicas: Array<{ id: "A" | "B" | "C"; entries: Array<{ key: string; value: string }> }>;
  pending: boolean;
  sequenceNumber: number;
};
export type MapTransportResult = {
  room: MapRoom;
  view: MapRoomView;
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

function signedInteger(value: unknown, tag: ErrorTag = "invalid-state"): number {
  requireInput(typeof value === "number" && Number.isSafeInteger(value),
    "expected a safe integer", tag);
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

function counterComponents(value: unknown, label: string): PNCounter["positive"] {
  const components = list(value, (entry) => {
    const component = record(entry);
    return { replicaId: replica(component.replicaId), count: counter(component.count) };
  }).sort((a, b) => lexical(a.replicaId, b.replicaId));
  requireInput(new Set(components.map((entry) => entry.replicaId)).size === components.length,
    `duplicate PN-counter ${label} components`);
  return components;
}

function pncounterState(value: unknown): PNCounter {
  const input = record(value);
  version(input.version);
  requireInput(input.kind === "pn-counter", "expected a PN-counter state", "kind-mismatch");
  const replicaId = replica(input.replicaId);
  const positive = counterComponents(input.positive, "positive");
  const negative = counterComponents(input.negative, "negative");
  const positiveTotal = positive.reduce((sum, entry) => sum + entry.count, 0);
  const negativeTotal = negative.reduce((sum, entry) => sum + entry.count, 0);
  requireInput(Number.isSafeInteger(positiveTotal), "PN-counter positive total exceeds the safe integer range");
  requireInput(Number.isSafeInteger(negativeTotal), "PN-counter negative total exceeds the safe integer range");
  const valueTotal = positiveTotal - negativeTotal;
  requireInput(Number.isSafeInteger(valueTotal), "PN-counter value exceeds the safe integer range");
  requireInput(signedInteger(input.value) === valueTotal,
    "PN-counter value must equal positive minus negative components");
  return { version: 1, kind: "pn-counter", replicaId, positive, negative, value: valueTotal };
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
const pnCounterRooms = new WeakMap<PNCounterRoom, sluiceCore.PnCounterRoom$>();
const sharedCounterRooms = new WeakMap<SharedCounterRoom, sluiceCore.SharedCounterRoom$>();
const setRooms = new WeakMap<SetRoom, sluiceCore.SetRoom$>();
const registerDemoRooms = new WeakMap<RegisterDemoRoom, core.RegisterDemoRoom$>();
const mapRooms = new WeakMap<MapRoom, sluiceCore.MapRoom$>();

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

function pnRoomHandle(value: unknown): sluiceCore.PnCounterRoom$ {
  requireInput(
    value !== null && typeof value === "object" && pnCounterRooms.has(value as PNCounterRoom),
    "expected a live PN-counter Sluice room",
  );
  return pnCounterRooms.get(value as PNCounterRoom)!;
}

function pnRoomBox(handle: sluiceCore.PnCounterRoom$): PNCounterRoom {
  const room = Object.freeze({}) as PNCounterRoom;
  pnCounterRooms.set(room, handle);
  return room;
}

function sharedRoomHandle(value: unknown): sluiceCore.SharedCounterRoom$ {
  requireInput(
    value !== null && typeof value === "object"
      && sharedCounterRooms.has(value as SharedCounterRoom),
    "expected a live SharedCounter Sluice room",
  );
  return sharedCounterRooms.get(value as SharedCounterRoom)!;
}

function sharedRoomBox(handle: sluiceCore.SharedCounterRoom$): SharedCounterRoom {
  const room = Object.freeze({}) as SharedCounterRoom;
  sharedCounterRooms.set(room, handle);
  return room;
}

function setRoomHandle(value: unknown): sluiceCore.SetRoom$ {
  requireInput(
    value !== null && typeof value === "object" && setRooms.has(value as SetRoom),
    "expected a live set Sluice room",
  );
  return setRooms.get(value as SetRoom)!;
}

function setRoomBox(handle: sluiceCore.SetRoom$): SetRoom {
  const room = Object.freeze({}) as SetRoom;
  setRooms.set(room, handle);
  return room;
}

function registerDemoHandle(value: unknown): core.RegisterDemoRoom$ {
  requireInput(
    value !== null && typeof value === "object"
      && registerDemoRooms.has(value as RegisterDemoRoom),
    "expected a live register demo room",
  );
  return registerDemoRooms.get(value as RegisterDemoRoom)!;
}

function registerDemoBox(handle: core.RegisterDemoRoom$): RegisterDemoRoom {
  const room = Object.freeze({}) as RegisterDemoRoom;
  registerDemoRooms.set(room, handle);
  return room;
}

function mapRoomHandle(value: unknown): sluiceCore.MapRoom$ {
  requireInput(
    value !== null && typeof value === "object" && mapRooms.has(value as MapRoom),
    "expected a live map Sluice room",
  );
  return mapRooms.get(value as MapRoom)!;
}

function mapRoomBox(handle: sluiceCore.MapRoom$): MapRoom {
  const room = Object.freeze({}) as MapRoom;
  mapRooms.set(room, handle);
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

function pnRoomView(handle: sluiceCore.PnCounterRoom$): PNCounterRoomView {
  const snapshot = kernel(sluiceCore.pncounter_room_snapshot(handle));
  return {
    replicas: [
      { id: "A", value: sluiceCore.PnCounterRoomSnapshot$PnCounterRoomSnapshot$a(snapshot) },
      { id: "B", value: sluiceCore.PnCounterRoomSnapshot$PnCounterRoomSnapshot$b(snapshot) },
      { id: "C", value: sluiceCore.PnCounterRoomSnapshot$PnCounterRoomSnapshot$c(snapshot) },
    ],
    pending: sluiceCore.PnCounterRoomSnapshot$PnCounterRoomSnapshot$pending(snapshot),
    sequenceNumber: sluiceCore.PnCounterRoomSnapshot$PnCounterRoomSnapshot$sequence_number(snapshot),
  };
}

function sharedRoomView(handle: sluiceCore.SharedCounterRoom$): SharedCounterRoomView {
  const snapshot = kernel(sluiceCore.sharedcounter_room_snapshot(handle));
  return {
    replicas: [
      { id: "A", value: sluiceCore.SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$a(snapshot) },
      { id: "B", value: sluiceCore.SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$b(snapshot) },
      { id: "C", value: sluiceCore.SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$c(snapshot) },
    ],
    pending: sluiceCore.SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$pending(snapshot),
    sequenceNumber:
      sluiceCore.SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$sequence_number(snapshot),
  };
}

function setRoomView(handle: sluiceCore.SetRoom$): SetRoomView {
  const snapshot = sluiceCore.set_room_snapshot(handle);
  return {
    replicas: [
      {
        id: "A",
        values: Array.from(
          sluiceCore.SetRoomSnapshot$SetRoomSnapshot$a(snapshot),
        ).sort(),
      },
      {
        id: "B",
        values: Array.from(
          sluiceCore.SetRoomSnapshot$SetRoomSnapshot$b(snapshot),
        ).sort(),
      },
      {
        id: "C",
        values: Array.from(
          sluiceCore.SetRoomSnapshot$SetRoomSnapshot$c(snapshot),
        ).sort(),
      },
    ],
    pending: sluiceCore.SetRoomSnapshot$SetRoomSnapshot$pending(snapshot),
    sequenceNumber: sluiceCore.SetRoomSnapshot$SetRoomSnapshot$sequence_number(snapshot),
  };
}

function registerDemoView(handle: core.RegisterDemoRoom$): RegisterDemoView {
  const snapshot = core.register_demo_snapshot(handle);
  return {
    replicas: [
      {
        id: "A",
        values: Array.from(
          core.RegisterDemoSnapshot$RegisterDemoSnapshot$a(snapshot),
        ).filter(Boolean),
      },
      {
        id: "B",
        values: Array.from(
          core.RegisterDemoSnapshot$RegisterDemoSnapshot$b(snapshot),
        ).filter(Boolean),
      },
      {
        id: "C",
        values: Array.from(
          core.RegisterDemoSnapshot$RegisterDemoSnapshot$c(snapshot),
        ).filter(Boolean),
      },
    ],
    pending: core.RegisterDemoSnapshot$RegisterDemoSnapshot$pending(snapshot),
    sequenceNumber:
      core.RegisterDemoSnapshot$RegisterDemoSnapshot$sequence_number(snapshot),
    winnerAuthor:
      core.RegisterDemoSnapshot$RegisterDemoSnapshot$winner_author(snapshot),
    timestamp: core.RegisterDemoSnapshot$RegisterDemoSnapshot$timestamp(snapshot),
    atomicValue:
      core.RegisterDemoSnapshot$RegisterDemoSnapshot$atomic_value(snapshot),
    latestValue:
      core.RegisterDemoSnapshot$RegisterDemoSnapshot$latest_value(snapshot),
    versions: Array.from(
      core.RegisterDemoSnapshot$RegisterDemoSnapshot$versions(snapshot),
    ),
  };
}

function mapRoomView(handle: sluiceCore.MapRoom$): MapRoomView {
  const snapshot = sluiceCore.map_room_snapshot(handle);
  const entries = (values: Iterable<sluiceCore.MapEntry$>) =>
    Array.from(values, (entry) => ({
      key: sluiceCore.MapEntry$MapEntry$key(entry),
      value: sluiceCore.MapEntry$MapEntry$value(entry),
    }));
  return {
    replicas: [
      { id: "A", entries: entries(sluiceCore.MapRoomSnapshot$MapRoomSnapshot$a(snapshot)) },
      { id: "B", entries: entries(sluiceCore.MapRoomSnapshot$MapRoomSnapshot$b(snapshot)) },
      { id: "C", entries: entries(sluiceCore.MapRoomSnapshot$MapRoomSnapshot$c(snapshot)) },
    ],
    pending: sluiceCore.MapRoomSnapshot$MapRoomSnapshot$pending(snapshot),
    sequenceNumber: sluiceCore.MapRoomSnapshot$MapRoomSnapshot$sequence_number(snapshot),
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

function loadPNCounter(state: PNCounter) {
  return kernel(core.pncounter_restore(JSON.stringify({
    type: "pn_counter", v: 1, state: {
      positive: {
        self_id: state.replicaId,
        counts: Object.fromEntries(state.positive.map((entry) => [entry.replicaId, entry.count])),
      },
      negative: {
        self_id: state.replicaId,
        counts: Object.fromEntries(state.negative.map((entry) => [entry.replicaId, entry.count])),
      },
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

const counterEntries = (entries: Iterable<core.CounterEntry$>): PNCounter["positive"] =>
  Array.from(entries, (entry) => ({
    replicaId: core.CounterEntry$CounterEntry$replica_id(entry),
    count: core.CounterEntry$CounterEntry$count(entry),
  })).sort((a, b) => lexical(a.replicaId, b.replicaId));

function pncounterFromCore(value: core.PositiveNegativeCounter$, replicaId: string): PNCounter {
  const snapshot = core.pncounter_snapshot(value);
  return {
    version: 1,
    kind: "pn-counter",
    replicaId,
    positive: counterEntries(core.PnCounterSnapshot$PnCounterSnapshot$positive(snapshot)),
    negative: counterEntries(core.PnCounterSnapshot$PnCounterSnapshot$negative(snapshot)),
    value: core.PnCounterSnapshot$PnCounterSnapshot$value(snapshot),
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

export function createPNCounterRoom(): Result<PNCounterTransportResult> {
  return attempt(() => {
    const handle = kernel(sluiceCore.new_pncounter_room());
    const room = pnRoomBox(handle);
    return { room, view: pnRoomView(handle), deliveries: [] };
  });
}

export function stagePNCounterRace(current: unknown): Result<PNCounterTransportResult> {
  return attempt(() => {
    const room = current as PNCounterRoom;
    const handle = kernel(sluiceCore.pncounter_room_stage_race(pnRoomHandle(room)));
    return { room, view: pnRoomView(handle), deliveries: [] };
  });
}

export function updatePNCounterRoom(
  current: unknown,
  replicaId: unknown,
  amount: unknown,
): Result<PNCounterTransportResult> {
  return attempt(() => {
    const room = current as PNCounterRoom;
    const replica = text(replicaId, "invalid-input");
    requireInput(replica === "A" || replica === "B" || replica === "C",
      "replicaId must be A, B, or C");
    const update = signedInteger(amount, "invalid-input");
    requireInput(update !== 0, "amount must be nonzero", "invalid-input");
    const handle = kernel(sluiceCore.pncounter_room_update(pnRoomHandle(room), replica, update));
    return { room, view: pnRoomView(handle), deliveries: [] };
  });
}

export function deliverPNCounterOperations(current: unknown): Result<PNCounterTransportResult> {
  return attempt(() => {
    const room = current as PNCounterRoom;
    const [handle, deliveries] = sluiceCore.pncounter_room_deliver(pnRoomHandle(room));
    return { room, view: pnRoomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function deliverOnePNCounterOperation(current: unknown): Result<PNCounterTransportResult> {
  return attempt(() => {
    const room = current as PNCounterRoom;
    const [handle, deliveries] = sluiceCore.pncounter_room_deliver_one(pnRoomHandle(room));
    return { room, view: pnRoomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function createSharedCounterRoom(): Result<SharedCounterTransportResult> {
  return attempt(() => {
    const handle = kernel(sluiceCore.new_sharedcounter_room());
    const room = sharedRoomBox(handle);
    return { room, view: sharedRoomView(handle), deliveries: [] };
  });
}

export function stageSharedCounterRace(current: unknown): Result<SharedCounterTransportResult> {
  return attempt(() => {
    const room = current as SharedCounterRoom;
    const handle = kernel(sluiceCore.sharedcounter_room_stage_race(sharedRoomHandle(room)));
    return { room, view: sharedRoomView(handle), deliveries: [] };
  });
}

export function updateSharedCounterRoom(
  current: unknown,
  replicaId: unknown,
  amount: unknown,
): Result<SharedCounterTransportResult> {
  return attempt(() => {
    const room = current as SharedCounterRoom;
    const replica = text(replicaId, "invalid-input");
    requireInput(replica === "A" || replica === "B" || replica === "C",
      "replicaId must be A, B, or C");
    const update = signedInteger(amount, "invalid-input");
    requireInput(update !== 0, "amount must be nonzero", "invalid-input");
    const handle = kernel(
      sluiceCore.sharedcounter_room_update(sharedRoomHandle(room), replica, update),
    );
    return { room, view: sharedRoomView(handle), deliveries: [] };
  });
}

export function deliverSharedCounterOperations(
  current: unknown,
): Result<SharedCounterTransportResult> {
  return attempt(() => {
    const room = current as SharedCounterRoom;
    const [handle, deliveries] =
      sluiceCore.sharedcounter_room_deliver(sharedRoomHandle(room));
    return { room, view: sharedRoomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function deliverOneSharedCounterOperation(
  current: unknown,
): Result<SharedCounterTransportResult> {
  return attempt(() => {
    const room = current as SharedCounterRoom;
    const [handle, deliveries] =
      sluiceCore.sharedcounter_room_deliver_one(sharedRoomHandle(room));
    return { room, view: sharedRoomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function createSetRoom(kind: unknown): Result<SetTransportResult> {
  return attempt(() => {
    const setKind = text(kind, "invalid-input");
    requireInput(
      setKind === "g-set" || setKind === "two-p-set" || setKind === "or-set",
      "kind must be g-set, two-p-set, or or-set",
      "invalid-input",
    );
    const handle = kernel(sluiceCore.new_set_room(setKind));
    const room = setRoomBox(handle);
    return { room, view: setRoomView(handle), deliveries: [] };
  });
}

export function stageSetRace(current: unknown): Result<SetTransportResult> {
  return attempt(() => {
    const room = current as SetRoom;
    const handle = kernel(sluiceCore.set_room_stage_race(setRoomHandle(room)));
    return { room, view: setRoomView(handle), deliveries: [] };
  });
}

export function updateSetRoom(
  current: unknown,
  replicaId: unknown,
  action: unknown,
  element: unknown,
): Result<SetTransportResult> {
  return attempt(() => {
    const room = current as SetRoom;
    const replica = text(replicaId, "invalid-input");
    requireInput(
      replica === "A" || replica === "B" || replica === "C",
      "replicaId must be A, B, or C",
      "invalid-input",
    );
    const setAction = text(action, "invalid-input");
    requireInput(
      setAction === "add" || setAction === "remove",
      "action must be add or remove",
      "invalid-input",
    );
    const value = text(element, "invalid-input");
    requireInput(value.trim().length > 0, "element must not be empty", "invalid-input");
    const handle = kernel(
      sluiceCore.set_room_update(setRoomHandle(room), replica, setAction, value),
    );
    return { room, view: setRoomView(handle), deliveries: [] };
  });
}

export function deliverSetOperations(current: unknown): Result<SetTransportResult> {
  return attempt(() => {
    const room = current as SetRoom;
    const [handle, deliveries] = sluiceCore.set_room_deliver(setRoomHandle(room));
    return { room, view: setRoomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function deliverOneSetOperation(current: unknown): Result<SetTransportResult> {
  return attempt(() => {
    const room = current as SetRoom;
    const [handle, deliveries] = sluiceCore.set_room_deliver_one(setRoomHandle(room));
    return { room, view: setRoomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function createRegisterDemoRoom(kind: unknown): Result<RegisterDemoResult> {
  return attempt(() => {
    const registerKind = text(kind, "invalid-input");
    requireInput(
      registerKind === "lww-register"
        || registerKind === "mv-register"
        || registerKind === "register-collection",
      "kind must be lww-register, mv-register, or register-collection",
      "invalid-input",
    );
    const handle = kernel(core.new_register_demo(registerKind));
    const room = registerDemoBox(handle);
    return { room, view: registerDemoView(handle) };
  });
}

export function stageRegisterDemoRace(current: unknown): Result<RegisterDemoResult> {
  return attempt(() => {
    const room = current as RegisterDemoRoom;
    const handle = kernel(core.register_demo_stage_race(registerDemoHandle(room)));
    registerDemoRooms.set(room, handle);
    return { room, view: registerDemoView(handle) };
  });
}

export function writeRegisterDemo(
  current: unknown,
  replicaId: unknown,
  value: unknown,
): Result<RegisterDemoResult> {
  return attempt(() => {
    const room = current as RegisterDemoRoom;
    const replica = text(replicaId, "invalid-input");
    requireInput(
      replica === "A" || replica === "B" || replica === "C",
      "replicaId must be A, B, or C",
      "invalid-input",
    );
    const content = text(value, "invalid-input");
    const handle = kernel(
      core.register_demo_write(registerDemoHandle(room), replica, content),
    );
    registerDemoRooms.set(room, handle);
    return { room, view: registerDemoView(handle) };
  });
}

export function deliverRegisterDemo(current: unknown): Result<RegisterDemoResult> {
  return attempt(() => {
    const room = current as RegisterDemoRoom;
    const handle = core.register_demo_deliver(registerDemoHandle(room));
    registerDemoRooms.set(room, handle);
    return { room, view: registerDemoView(handle) };
  });
}

export function createMapRoom(kind: unknown): Result<MapTransportResult> {
  return attempt(() => {
    const mapKind = text(kind, "invalid-input");
    requireInput(
      mapKind === "shared-map"
        || mapKind === "lww-map"
        || mapKind === "or-map"
        || mapKind === "shared-directory",
      "kind must be shared-map, lww-map, or-map, or shared-directory",
      "invalid-input",
    );
    const handle = kernel(sluiceCore.new_map_room(mapKind));
    const room = mapRoomBox(handle);
    return { room, view: mapRoomView(handle), deliveries: [] };
  });
}

export function stageMapRace(current: unknown): Result<MapTransportResult> {
  return attempt(() => {
    const room = current as MapRoom;
    const handle = kernel(sluiceCore.map_room_stage_race(mapRoomHandle(room)));
    return { room, view: mapRoomView(handle), deliveries: [] };
  });
}

export function updateMapRoom(
  current: unknown,
  replicaId: unknown,
  action: unknown,
  key: unknown,
  value: unknown,
): Result<MapTransportResult> {
  return attempt(() => {
    const room = current as MapRoom;
    const replica = text(replicaId, "invalid-input");
    requireInput(
      replica === "A" || replica === "B" || replica === "C",
      "replicaId must be A, B, or C",
      "invalid-input",
    );
    const mapAction = text(action, "invalid-input");
    requireInput(
      mapAction === "set"
        || mapAction === "remove"
        || mapAction === "increment"
        || mapAction === "mkdir"
        || mapAction === "rmdir",
      "invalid map action",
      "invalid-input",
    );
    const mapKey = text(key, "invalid-input");
    requireInput(mapKey.trim().length > 0, "key must not be empty", "invalid-input");
    const mapValue = text(value, "invalid-input");
    const handle = kernel(
      sluiceCore.map_room_update(
        mapRoomHandle(room),
        replica,
        mapAction,
        mapKey,
        mapValue,
      ),
    );
    return { room, view: mapRoomView(handle), deliveries: [] };
  });
}

export function deliverMapOperations(current: unknown): Result<MapTransportResult> {
  return attempt(() => {
    const room = current as MapRoom;
    const [handle, deliveries] = sluiceCore.map_room_deliver(mapRoomHandle(room));
    return { room, view: mapRoomView(handle), deliveries: transportDeliveries(deliveries) };
  });
}

export function deliverOneMapOperation(current: unknown): Result<MapTransportResult> {
  return attempt(() => {
    const room = current as MapRoom;
    const [handle, deliveries] = sluiceCore.map_room_deliver_one(mapRoomHandle(room));
    return { room, view: mapRoomView(handle), deliveries: transportDeliveries(deliveries) };
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

export function createPNCounter(replicaId: unknown): Result<PNCounter> {
  return attempt(() => {
    const id = replica(replicaId, "invalid-input");
    return pncounterFromCore(core.new_pncounter(id), id);
  });
}

export function updatePNCounter(current: unknown, amount: unknown): Result<PNCounterChange> {
  return attempt(() => {
    const input = pncounterState(current);
    const delta = signedInteger(amount, "invalid-input");
    const components = delta >= 0 ? input.positive : input.negative;
    const magnitude = Math.abs(delta);
    const own = components.find((entry) => entry.replicaId === input.replicaId)?.count ?? 0;
    const componentTotal = components.reduce((sum, entry) => sum + entry.count, 0);
    requireInput(own <= Number.MAX_SAFE_INTEGER - magnitude
      && componentTotal <= Number.MAX_SAFE_INTEGER - magnitude,
    "PN-counter component exhausted", "counter-exhausted");
    requireInput(Number.isSafeInteger(input.value + delta),
      "PN-counter value exhausted", "counter-exhausted");
    const [next, operation] = core.pncounter_update(loadPNCounter(input), delta);
    return {
      state: pncounterFromCore(next, input.replicaId),
      operation: {
        version: 1,
        type: "pn-counter-operation",
        delta: pncounterFromCore(operation, input.replicaId),
      },
    };
  });
}

export function mergePNCounter(current: unknown, remote: unknown): Result<PNCounter> {
  return attempt(() => {
    const input = pncounterState(current);
    const payload = record(remote);
    if (payload.type === "pn-counter-operation") version(payload.version);
    const incoming = pncounterState(payload.type === "pn-counter-operation" ? payload.delta : payload);
    return pncounterFromCore(
      core.pncounter_merge(loadPNCounter(input), loadPNCounter(incoming)),
      input.replicaId,
    );
  });
}

export function inspectPNCounter(current: unknown): Result<{
  value: number;
  positive: PNCounter["positive"];
  negative: PNCounter["negative"];
  causal: PNCounter;
}> {
  return attempt(() => {
    const input = pncounterState(current);
    return {
      value: input.value,
      positive: input.positive,
      negative: input.negative,
      causal: input,
    };
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
