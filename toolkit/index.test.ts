import { describe, expect, test } from "vitest";
import {
  add, createMvRegister, createOrSet, createPNCounter, createPNCounterRoom,
  createRegisterDemoRoom,
  createRemainingDemoRoom,
  createMapRoom,
  createSetRoom, createSharedCounterRoom, deliverOneSharedCounterOperation,
  deliverPNCounterOperations, deliverSharedCounterOperations, inspect,
  deliverMapOperations, deliverRegisterDemo, deliverSetOperations, inspectPNCounter, merge, mergePNCounter, remove, stagePNCounterRace,
  deliverRemainingDemo,
  editRemainingSharedText,
  insertRemainingSequenceStop,
  stageMapRace,
  stageRegisterDemoRace,
  stageRemainingDemoRace,
  stageSetRace,
  stageSharedCounterRace, updatePNCounter, updatePNCounterRoom,
  updateSharedCounterRoom, write,
  type Change, type Result, type State,
  type RemainingDemoOperationResult,
} from "@atlas/toolkit";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

function unwrapRemaining<T>(result: RemainingDemoOperationResult<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

test.each([
  ["shared-sequence", ["Bridge", "Weir", "North gate"], ["Bridge", "Falls", "Marsh", "Weir", "North gate"]],
  ["shared-text", ["The weir is clear."], ["The still calm weir is clear."]],
  ["claims", ["gate-key: unclaimed"], ["gate-key: Alice"]],
  ["fifo-work-queue", ["Queue: inspect bridge"], ["Alice owns inspect bridge", "Queue empty"]],
  ["task-manager", ["dispatcher: unassigned"], ["dispatcher: Alice", "waiting: Bob, Carol"]],
  ["pact-map", ["closure-target: absent"], ["closure-target: ridge-pass", "accepted by A, B, C"]],
  ["json-ot", ["{}"], ['{"revision":1,"title":"field notes"}']],
  ["shared-rich-text", ["Hello World"], ["Hello [bold] World ▲"]],
] as const)("%s derives its view from Watershed operations", (kind, initial, expected) => {
  const created = unwrapRemaining(createRemainingDemoRoom(kind));
  expect(created.view.replicas.map(({ values }) => values)).toEqual([initial, initial, initial]);

  const staged = unwrapRemaining(stageRemainingDemoRace(created.room));
  expect(staged.view.pending).toBeGreaterThan(0);
  expect(staged.view.replicas.map(({ values }) => values)).not.toEqual([
    expected,
    expected,
    expected,
  ]);

  const delivered = unwrapRemaining(deliverRemainingDemo(created.room));
  expect(delivered.view.replicas.map(({ values }) => values)).toEqual([
    expected,
    expected,
    expected,
  ]);
  expect(delivered.view.pending).toBe(0);

  const reset = unwrapRemaining(createRemainingDemoRoom(kind));
  expect(reset.view.replicas.map(({ values }) => values)).toEqual([initial, initial, initial]);
});

test("SharedSequence accepts repeated inserts from every hiker and merges equal names", () => {
  const room = unwrapRemaining(createRemainingDemoRoom("shared-sequence")).room;
  unwrapRemaining(insertRemainingSequenceStop(room, "A", 1, "Falls"));
  unwrapRemaining(insertRemainingSequenceStop(room, "C", 1, "Falls"));
  unwrapRemaining(insertRemainingSequenceStop(room, "B", 3, "Marsh"));
  unwrapRemaining(insertRemainingSequenceStop(room, "C", 2, "Ridge"));

  const staged = unwrapRemaining(insertRemainingSequenceStop(room, "A", 0, "Lookout"));
  expect(staged.view.pending).toBe(5);
  expect(staged.view.replicas[0].values[0]).toBe("Lookout");
  expect(staged.view.replicas[2].values).toContain("Ridge");
  expect(insertRemainingSequenceStop(room, "B", 0, "  ")).toMatchObject({
    ok: false, error: { tag: "invalid-input" },
  });
  expect(insertRemainingSequenceStop(room, "B", 99, "Summit")).toMatchObject({
    ok: false, error: { tag: "invalid-state" },
  });
  const delivered = unwrapRemaining(deliverRemainingDemo(room)).view;
  expect(delivered.pending).toBe(0);
  expect(delivered.replicas.map(({ values }) => values)).toEqual([
    delivered.replicas[0].values,
    delivered.replicas[0].values,
    delivered.replicas[0].values,
  ]);
  expect(delivered.replicas[0].values.filter((value) => value === "Falls")).toHaveLength(2);
  expect(delivered.replicas[0].values).toHaveLength(8);
});

test("SharedText accepts concurrent inserts and overlapping edits", () => {
  const room = unwrapRemaining(createRemainingDemoRoom("shared-text")).room;
  unwrapRemaining(editRemainingSharedText(room, "A", 4, 4, "still "));
  unwrapRemaining(editRemainingSharedText(room, "B", 4, 8, "levee"));
  unwrapRemaining(editRemainingSharedText(room, "C", 5, 7, ""));

  const staged = unwrapRemaining(editRemainingSharedText(room, "C", 0, 0, "Note: "));
  expect(staged.view.pending).toBe(4);
  expect(staged.view.replicas[0].values[0]).toContain("still");
  expect(staged.view.replicas[1].values[0]).toContain("levee");
  expect(staged.view.replicas[2].values[0]).toContain("Note:");
  expect(editRemainingSharedText(room, "A", 0, 0, "")).toMatchObject({
    ok: false, error: { tag: "invalid-input" },
  });

  const delivered = unwrapRemaining(deliverRemainingDemo(room)).view;
  expect(delivered.pending).toBe(0);
  expect(delivered.replicas.map(({ values }) => values)).toEqual([
    delivered.replicas[0].values,
    delivered.replicas[0].values,
    delivered.replicas[0].values,
  ]);
});

test("the public facade returns plain JSON data and does not mutate its inputs", () => {
  for (const create of [createMvRegister, createOrSet]) {
    const initial = unwrap<State>(create("A"));
    const before = JSON.stringify(initial);
    const changed = unwrap<Change>(initial.kind === "mv-register" ? write(initial, "value") : add(initial, "value"));
    const remote = unwrap<State>(create("B"));
    const result = unwrap(merge(remote, JSON.parse(JSON.stringify(changed.operation))));
    expect(unwrap(inspect(result)).values).toEqual(["value"]);
    expect(JSON.stringify(initial)).toBe(before);
    expect(unwrap(inspect(remote)).values).toEqual([]);
    const plain = (value: unknown): void => {
      if (value !== null && typeof value === "object") {
        expect(Object.getPrototypeOf(value)).toBe(Array.isArray(value) ? Array.prototype : Object.prototype);
        Object.values(value).forEach(plain);
      } else expect(["string", "number", "boolean"]).toContain(typeof value);
    };
    plain(changed);
    plain(result);
    plain(unwrap(inspect(result)));
  }
});

test.each([
  ["g-set", [["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"]]],
  ["two-p-set", [[], [], []]],
  ["or-set", [["Eagle Creek"], ["Eagle Creek"], ["Eagle Creek"]]],
] as const)("%s Sluice room converges with its set rule", (kind, expected) => {
  const room = unwrap(createSetRoom(kind)).room;
  const staged = unwrap(stageSetRace(room));
  expect(staged.view.pending).toBe(true);
  const delivered = unwrap(deliverSetOperations(room));
  expect(delivered.view.replicas.map(({ values }) => values)).toEqual(expected);
  expect(delivered.view.pending).toBe(false);
});

test.each([
  ["lww-register", [["Trail closed"], ["Trail closed"], ["Trail closed"]]],
  ["mv-register", [["Trail closed", "Trail open"], ["Trail closed", "Trail open"], ["Trail closed", "Trail open"]]],
] as const)("%s demo converges on its register rule", (kind, expected) => {
  const room = unwrap(createRegisterDemoRoom(kind)).room;
  unwrap(stageRegisterDemoRace(room));
  const delivered = unwrap(deliverRegisterDemo(room));
  expect(delivered.view.replicas.map(({ values }) => values)).toEqual(expected);
});

test("RegisterMap retains both reads after concurrent writes", () => {
  const room = unwrap(createRegisterDemoRoom("register-map")).room;
  expect(unwrap(stageRegisterDemoRace(room)).view.replicas.map(({ values }) => values))
    .toEqual([[], [], []]);
  expect(unwrap(deliverRegisterDemo(room)).view).toMatchObject({
    atomicValue: "Trail open",
    latestValue: "Trail closed",
    versions: ["Trail open", "Trail closed"],
  });
});

test.each([
  ["shared-map", [
    { key: "bridge-status", value: "Inspection due" },
    { key: "gate-status", value: "Trail closed" },
  ]],
  ["lww-map", [{ key: "gate-status", value: "Trail closed" }]],
  ["or-map", [{ key: "Eagle Creek", value: "8" }]],
  ["shared-directory", [{ key: "eagle-creek", value: "folder" }]],
] as const)("%s demo converges on its map rule", (kind, expected) => {
  const room = unwrap(createMapRoom(kind)).room;
  unwrap(stageMapRace(room));
  const delivered = unwrap(deliverMapOperations(room));
  expect(delivered.view.replicas.map(({ entries }) => entries))
    .toEqual([expected, expected, expected]);
  expect(delivered.view.pending).toBe(false);
});

test("equal-string register siblings retain both identities and full authored clocks", () => {
  const a = unwrap(write(unwrap(createMvRegister("A")), "same"));
  const b = unwrap(write(unwrap(createMvRegister("B")), "same"));
  const joined = unwrap(merge(a.state, b.operation));
  expect(unwrap(inspect(joined)).values).toEqual(["same", "same"]);
  const resolved = unwrap(write(joined, "resolved"));
  expect(resolved.operation.delta.clock).toEqual([
    { replicaId: "A", counter: 2 }, { replicaId: "B", counter: 1 },
  ]);
  expect(unwrap(inspect(unwrap(merge(b.state, resolved.operation)))).values).toEqual(["resolved"]);
});

test("OR-set sparse deltas retain removal knowledge across stale replay", () => {
  const added = unwrap(add(unwrap(createOrSet("A")), "beacon"));
  const removed = unwrap(remove(added.state, "beacon"));
  expect(removed.operation.delta.entries).toEqual([]);
  expect(removed.operation.delta.tombstones).toEqual([{ replicaId: "A", counter: 1 }]);
  const early = unwrap(merge(unwrap(createOrSet("B")), removed.operation));
  const late = unwrap(merge(early, added.operation));
  expect(unwrap(inspect(late)).values).toEqual([]);
  expect(unwrap(merge(late, removed.operation))).toEqual(late);
});

test("merged metadata has deterministic order across delivery permutations", () => {
  for (const create of [createMvRegister, createOrSet]) {
    const a = unwrap<State>(create("A"));
    const b = unwrap<State>(create("B"));
    const left = unwrap<Change>(a.kind === "mv-register" ? write(a, "z") : add(a, "z"));
    const right = unwrap<Change>(b.kind === "mv-register" ? write(b, "a") : add(b, "a"));
    const start = unwrap<State>(create("C"));
    const ab = unwrap(merge(unwrap(merge(start, left.operation)), right.operation));
    const ba = unwrap(merge(unwrap(merge(start, right.operation)), left.operation));
    expect(JSON.stringify(ab)).toBe(JSON.stringify(ba));
  }
});

test("PN-counter mixed-sign updates converge and duplicate merge is safe", () => {
  const a = unwrap(updatePNCounter(unwrap(createPNCounter("A")), 3));
  const b = unwrap(updatePNCounter(unwrap(createPNCounter("B")), -1));
  const ab = unwrap(mergePNCounter(unwrap(mergePNCounter(unwrap(createPNCounter("C")), a.operation)), b.operation));
  const ba = unwrap(mergePNCounter(unwrap(mergePNCounter(unwrap(createPNCounter("C")), b.operation)), a.operation));
  expect(unwrap(inspectPNCounter(ab))).toMatchObject({
    value: 2,
    positive: [{ replicaId: "A", count: 3 }],
    negative: [{ replicaId: "B", count: 1 }],
  });
  expect(ba).toEqual(ab);
  expect(unwrap(mergePNCounter(ab, b.operation))).toEqual(ab);
});

test("PN-counter supports negative values and validates its component totals", () => {
  const corrected = unwrap(updatePNCounter(unwrap(createPNCounter("A")), -3)).state;
  expect(unwrap(inspectPNCounter(corrected)).value).toBe(-3);
  const positive = unwrap(updatePNCounter(unwrap(createPNCounter("A")), 1)).state;
  expect(updatePNCounter(positive, Number.MAX_SAFE_INTEGER)).toMatchObject({
    ok: false,
    error: { tag: "counter-exhausted" },
  });
  expect(inspectPNCounter({ ...corrected, value: 0 })).toMatchObject({
    ok: false,
    error: { tag: "invalid-state" },
  });
});

test("PN-counter Sluice room stages and delivers the correction race", () => {
  const room = unwrap(createPNCounterRoom()).room;
  const staged = unwrap(stagePNCounterRace(room));
  expect(staged.view.replicas.map(({ value }) => value)).toEqual([13, 9, 10]);
  expect(staged.view.pending).toBe(true);
  const delivered = unwrap(deliverPNCounterOperations(room));
  expect(delivered.view.replicas.map(({ value }) => value)).toEqual([12, 12, 12]);
  expect(delivered.view.pending).toBe(false);
  expect(delivered.deliveries).toHaveLength(6);
});

test("PN-counter Sluice room accepts signed updates from all three clients", () => {
  const room = unwrap(createPNCounterRoom()).room;
  expect(unwrap(updatePNCounterRoom(room, "C", -3)).view.replicas.map(({ value }) => value))
    .toEqual([10, 10, 7]);
  expect(updatePNCounterRoom(room, "D", 1)).toMatchObject({
    ok: false,
    error: { tag: "invalid-state" },
  });
  expect(updatePNCounterRoom(room, "A", 0)).toMatchObject({
    ok: false,
    error: { tag: "invalid-input" },
  });
});

test("SharedCounter Sluice room sequences signed operations", () => {
  const room = unwrap(createSharedCounterRoom()).room;
  const staged = unwrap(stageSharedCounterRace(room));
  expect(staged.view.replicas.map(({ value }) => value)).toEqual([13, 9, 10]);
  expect(staged.view.pending).toBe(true);

  const first = unwrap(deliverOneSharedCounterOperation(room));
  expect(new Set(first.deliveries.map(({ sequenceNumber }) => sequenceNumber)).size).toBe(1);
  expect(first.deliveries).toHaveLength(3);
  expect(first.view.pending).toBe(true);

  const second = unwrap(deliverOneSharedCounterOperation(room));
  expect(second.view.replicas.map(({ value }) => value)).toEqual([12, 12, 12]);
  expect(second.view.pending).toBe(false);
  expect(second.deliveries).toHaveLength(3);
  expect(second.deliveries[0].sequenceNumber).toBeGreaterThan(first.deliveries[0].sequenceNumber);

  const repeated = unwrap(deliverSharedCounterOperations(room));
  expect(repeated.deliveries).toEqual([]);
  expect(repeated.view.replicas.map(({ value }) => value)).toEqual([12, 12, 12]);
});

test("SharedCounter Sluice room accepts signed updates from all three clients", () => {
  const room = unwrap(createSharedCounterRoom()).room;
  unwrap(updateSharedCounterRoom(room, "A", 1));
  unwrap(updateSharedCounterRoom(room, "B", -3));
  const staged = unwrap(updateSharedCounterRoom(room, "C", 3));
  expect(staged.view.replicas.map(({ value }) => value)).toEqual([11, 7, 13]);
  expect(unwrap(deliverSharedCounterOperations(room)).view.replicas.map(({ value }) => value))
    .toEqual([11, 11, 11]);
  expect(updateSharedCounterRoom(room, "D", 1)).toMatchObject({
    ok: false,
    error: { tag: "invalid-state" },
  });
  expect(updateSharedCounterRoom(room, "A", 0)).toMatchObject({
    ok: false,
    error: { tag: "invalid-input" },
  });
});

describe("facade validation", () => {
  test("rejects malformed input, unsupported versions, and mixed kinds", () => {
    const mv = unwrap(createMvRegister("A"));
    const set = unwrap(createOrSet("A"));
    expect(createMvRegister("")).toMatchObject({ ok: false, error: { tag: "invalid-input" } });
    expect(write(mv, 5)).toMatchObject({ ok: false, error: { tag: "invalid-input" } });
    expect(inspect(null)).toMatchObject({ ok: false, error: { tag: "invalid-state" } });
    expect(inspect({ ...mv, version: 2 })).toMatchObject({ ok: false, error: { tag: "unsupported-version" } });
    expect(merge(mv, set)).toMatchObject({ ok: false, error: { tag: "kind-mismatch" } });
    expect(merge(mv, { version: 2, type: "operation", delta: mv }))
      .toMatchObject({ ok: false, error: { tag: "unsupported-version" } });
    expect(add(mv, "wrong")).toMatchObject({ ok: false, error: { tag: "kind-mismatch" } });
    expect(write(set, "wrong")).toMatchObject({ ok: false, error: { tag: "kind-mismatch" } });
  });

  test("rejects duplicate, contradictory, and colliding tags before dictionary construction", () => {
    const mv = unwrap(write(unwrap(createMvRegister("A")), "one")).state;
    expect(inspect({ ...mv, entries: [...mv.entries, ...mv.entries] })).toMatchObject({ ok: false });
    expect(inspect({ ...mv, clock: [] })).toMatchObject({ ok: false });
    expect(merge(mv, { ...mv, entries: [{ ...mv.entries[0], value: "collision" }] }))
      .toMatchObject({ ok: false, error: { tag: "conflicting-tag" } });
    const set = unwrap(add(unwrap(createOrSet("A")), "one")).state;
    expect(inspect({ ...set, counter: 0 })).toMatchObject({ ok: false });
    expect(inspect({ ...set, tombstones: set.entries[0].tags })).toMatchObject({ ok: false });
    expect(inspect({ ...set, entries: [...set.entries, ...set.entries] })).toMatchObject({ ok: false });
    expect(merge(set, { ...set, entries: [{ ...set.entries[0], value: "collision" }] }))
      .toMatchObject({ ok: false, error: { tag: "conflicting-tag" } });
  });

  test("rejects sparse arrays and accessors rather than skipping or executing them", () => {
    const mv = unwrap(createMvRegister("A"));
    expect(inspect({ ...mv, clock: new Array(1) })).toMatchObject({ ok: false });
    const getter = { ...mv, get entries() { throw new Error("must not execute"); } };
    expect(inspect(getter)).toMatchObject({ ok: false, error: { tag: "invalid-state" } });
  });

  test("preserves special object keys and empty strings through the kernel summary codec", () => {
    let set = unwrap(createOrSet("__proto__"));
    for (const value of ["__proto__", "constructor", ""]) set = unwrap(add(set, value)).state;
    const remote = unwrap(merge(unwrap(createOrSet("constructor")), set));
    expect(unwrap(inspect(remote)).values).toEqual(["", "__proto__", "constructor"]);
    expect(unwrap(remove(remote, "__proto__")).state.entries.map((entry) => entry.value))
      .toEqual(["", "constructor"]);
  });

  test("prevents unsafe allocation while allowing removals at the counter limit", () => {
    const tag = { replicaId: "A", counter: Number.MAX_SAFE_INTEGER };
    const mv = { ...unwrap(createMvRegister("A")), entries: [{ tag, value: "last" }], clock: [tag] };
    const set = {
      ...unwrap(createOrSet("A")), counter: Number.MAX_SAFE_INTEGER,
      entries: [{ value: "last", tags: [tag] }],
    };
    expect(write(mv, "overflow")).toMatchObject({ ok: false, error: { tag: "counter-exhausted" } });
    expect(add(set, "overflow")).toMatchObject({ ok: false, error: { tag: "counter-exhausted" } });
    expect(unwrap(remove(set, "last")).state.entries).toEqual([]);
    expect(inspect({ ...set, counter: Number.MAX_SAFE_INTEGER + 1 })).toMatchObject({ ok: false });
  });
});
