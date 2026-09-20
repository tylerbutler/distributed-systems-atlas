import { describe, expect, test } from "vitest";
import {
  add, createMvRegister, createOrSet, inspect, merge, remove, write,
  type Change, type Result, type State,
} from "@atlas/toolkit";

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

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
