import { describe, expect, test, vi } from "vitest";
import * as watershed from "@tylerbutler/watershed-atlas";
import type { EngineKind, LabAction, SimulationEngine, TraceFrame } from "../contract";
import { createEngine } from "../engine-registry";

vi.mock("@tylerbutler/watershed-atlas", { spy: true });

function create(kind: EngineKind, replicas = ["A", "B"], initialValues: string[] = []) {
  return createEngine({ id: "test", kind, replicas, initialValues });
}

function dispatch(engine: SimulationEngine, action: LabAction): TraceFrame {
  const result = engine.dispatch(action);
  if ("message" in result) throw new Error(result.message);
  return result;
}

describe.each(["mv-register", "or-set"] as const)("%s Watershed adapter", (kind) => {
  const edit = (replica: string, value: string): LabAction => ({
    type: kind === "mv-register" ? "write" : "add", replica, value,
  });

  test("retains immutable authored deltas, blocks partitions, and merges duplicate deliveries", () => {
    const engine = create(kind);
    dispatch(engine, edit("A", "first"));
    const queued = engine.current();
    dispatch(engine, { type: "duplicate", message: "m1:A:B" });
    dispatch(engine, edit("A", "later"));
    dispatch(engine, { type: "partition", left: "B", right: "A" });
    const before = engine.current();
    expect(engine.dispatch({ type: "deliver", message: "m1:A:B" })).toMatchObject({
      message: "message crosses an active partition", lastFrame: before,
    });
    expect(engine.current()).toBe(before);
    dispatch(engine, { type: "heal", left: "A", right: "B" });
    expect(engine.current().messages).toHaveLength(3);
    dispatch(engine, { type: "deliver", message: "m2:A:B" });
    const once = dispatch(engine, { type: "deliver", message: "m1:A:B" });
    expect(once.invariants.converged).toBe(false);
    const twice = dispatch(engine, { type: "deliver", message: "m1:A:B:copy1" });
    expect(twice.replicas).toEqual(once.replicas);
    expect(twice.invariants.converged).toBe(true);
    expect(twice.replicas[1].value).toEqual(kind === "mv-register" ? ["later"] : ["first", "later"]);
    expect(queued.messages[0]).toEqual(engine.history()[1].messages[0]);
    expect(twice.messages).toEqual([]);
  });

  test("reset restores counters, provenance, queues, partitions, and the same initial frame", () => {
    const engine = create(kind, ["C", "B", "A"]);
    const initial = engine.current();
    const actions: LabAction[] = [
      edit("B", "one"), { type: "duplicate", message: "m1:B:A" },
      { type: "deliver", message: "m1:B:A" }, { type: "partition", left: "A", right: "B" },
    ];
    actions.forEach((action) => dispatch(engine, action));
    const history = engine.history();
    expect(dispatch(engine, { type: "reset" })).toBe(initial);
    expect(engine.history()).toEqual([initial]);
    actions.forEach((action) => dispatch(engine, action));
    expect(engine.history()).toEqual(history);
    const sorted = create(kind, ["A", "B", "C"]);
    actions.forEach((action) => dispatch(sorted, action));
    expect(sorted.history()).toEqual(history);
    const frozen = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(frozen);
      }
    };
    frozen(history);
    expect(Object.isFrozen(actions[0])).toBe(false);
    Reflect.set(actions[0], "value", "changed");
    expect(history[1].action).toEqual(edit("B", "one"));
  });

  test("rejects unsupported or invalid actions atomically without consuming message IDs", () => {
    const engine = create(kind);
    const invalid: LabAction[] = [
      edit("missing", "no"), { type: "send", from: "A", to: "B" },
      { type: "local-event", replica: "A" }, { type: "compare-events", pairs: [] },
      { type: "compare-vectors", left: {}, right: {} },
      { type: "deliver", message: "missing" }, { type: "duplicate", message: "missing" },
      { type: "partition", left: "A", right: "A" }, { type: "heal", left: "A", right: "missing" },
      kind === "mv-register" ? { type: "add", replica: "A", value: "no" } : { type: "write", replica: "A", value: "no" },
    ];
    for (const action of invalid) {
      const previous = engine.current();
      const history = engine.history();
      expect(engine.dispatch(action)).toMatchObject({ action, engine: "test", lastFrame: previous });
      expect(engine.current()).toBe(previous);
      expect(engine.history()).toBe(history);
    }
    const malformed = edit("A", "valid");
    Reflect.set(malformed, "value", 42);
    const before = engine.current();
    const history = engine.history();
    expect(engine.dispatch(malformed)).toMatchObject({
      message: expect.stringContaining("invalid-input"), lastFrame: before,
    });
    expect(engine.current()).toBe(before);
    expect(engine.history()).toBe(history);
    expect(dispatch(engine, edit("A", "")).messages[0].id).toBe("m1:A:B");
  });

  test("surfaces package merge errors without losing the message or changing history", () => {
    const engine = create(kind);
    dispatch(engine, edit("A", "one"));
    const before = engine.current();
    const history = engine.history();
    const merge = vi.mocked(watershed.merge).mockReturnValueOnce({
      ok: false, error: { tag: "conflicting-tag", message: "test collision" },
    });
    try {
      expect(engine.dispatch({ type: "deliver", message: "m1:A:B" })).toMatchObject({
        engine: "test", message: "conflicting-tag: test collision", lastFrame: before,
      });
      expect(engine.current()).toBe(before);
      expect(engine.history()).toBe(history);
    } finally {
      merge.mockRestore();
    }
    expect(dispatch(engine, { type: "deliver", message: "m1:A:B" }).invariants.converged).toBe(true);
  });

  test.each([[], ["A", "A"], [""], [" "], ["A:B"]].map((replicas) => ({ replicas })))("rejects invalid replica IDs $replicas", ({ replicas }) => {
    expect(() => create(kind, replicas)).toThrow(/replica/i);
  });

  test("supports special object-key replica IDs without prototype lookups", () => {
    const engine = create(kind, ["__proto__", "constructor"]);
    dispatch(engine, edit("__proto__", "safe"));
    const frame = dispatch(engine, { type: "deliver", message: "m1:__proto__:constructor" });
    expect(frame.replicas.map((replica) => replica.value)).toEqual([["safe"], ["safe"]]);
    expect(frame.invariants.converged).toBe(true);
  });
});

test("MV-register keeps equal strings as separate siblings and resolves only observed writes", () => {
  const engine = create("mv-register", ["A", "B", "C"]);
  dispatch(engine, { type: "write", replica: "A", value: "same" });
  dispatch(engine, { type: "write", replica: "B", value: "same" });
  dispatch(engine, { type: "deliver", message: "m2:B:A" });
  const a = engine.current().replicas[0];
  if (a.observation !== "mv-register") throw new Error("Expected register");
  expect(a.siblings).toEqual([
    { value: "same", version: { A: 1, B: 0, C: 0 } },
    { value: "same", version: { A: 0, B: 1, C: 0 } },
  ]);
  dispatch(engine, { type: "write", replica: "C", value: "unseen" });
  dispatch(engine, { type: "write", replica: "A", value: "resolved" });
  for (const message of engine.current().messages) dispatch(engine, { type: "deliver", message: message.id });
  expect(engine.current().replicas.map((replica) => replica.value)).toEqual([
    ["resolved", "unseen"], ["resolved", "unseen"], ["resolved", "unseen"],
  ]);
  expect(engine.current().invariants.converged).toBe(true);
});

test("OR-set records sparse removal deltas, tombstone-only members, and stale add replay", () => {
  const engine = create("or-set");
  dispatch(engine, { type: "add", replica: "A", value: "first" });
  dispatch(engine, { type: "add", replica: "A", value: "other" });
  dispatch(engine, { type: "remove", replica: "A", value: "first" });
  expect(engine.current().messages[2]).toMatchObject({
    observation: "or-set",
    members: [{ value: "first", dots: [], removed: [{ replica: "A", counter: 1 }] }],
    context: { A: 1, B: 0 },
  });
  dispatch(engine, { type: "deliver", message: "m3:A:B" });
  expect(engine.current().replicas[1]).toMatchObject({ value: [], members: [
    { value: "first", dots: [], removed: [{ replica: "A", counter: 1 }] },
  ] });
  dispatch(engine, { type: "deliver", message: "m1:A:B" });
  dispatch(engine, { type: "deliver", message: "m2:A:B" });
  expect(engine.current().replicas.map((replica) => replica.value)).toEqual([["other"], ["other"]]);
  expect(engine.current().invariants).toMatchObject({ removedDotsStayRemoved: true, converged: true });
});

test("OR-set removes all observed tags for one value and preserves unrelated and future adds", () => {
  const engine = create("or-set");
  const actions: LabAction[] = [
    { type: "remove", replica: "A", value: "absent" },
    { type: "add", replica: "A", value: "" },
    { type: "add", replica: "B", value: "" },
    { type: "deliver", message: "m3:B:A" },
    { type: "add", replica: "A", value: "other" },
    { type: "remove", replica: "A", value: "" },
  ];
  actions.forEach((action) => dispatch(engine, action));
  expect(engine.current().replicas[0]).toMatchObject({
    value: ["other"],
    members: [
      { value: "", dots: [], removed: [{ replica: "A", counter: 1 }, { replica: "B", counter: 1 }] },
      { value: "other", dots: [{ replica: "A", counter: 2 }], removed: [] },
    ],
  });
  dispatch(engine, { type: "add", replica: "A", value: "" });
  for (const message of [...engine.current().messages].reverse()) dispatch(engine, { type: "deliver", message: message.id });
  expect(engine.current().replicas.map((replica) => replica.value)).toEqual([["", "other"], ["", "other"]]);
  expect(Object.values(engine.current().invariants).every(Boolean)).toBe(true);
});

test("initial values are authored once with the package and shared without messages", () => {
  const register = create("mv-register", ["B", "A"], ["seed"]);
  expect(register.current().replicas.map((replica) => replica.value)).toEqual([["seed"], ["seed"]]);
  expect(register.current().invariants.converged).toBe(true);
  expect(() => create("mv-register", ["A", "B"], ["one", "two"])).toThrow(/initial value/i);
  const set = create("or-set", ["B", "A"], ["zebra", "beacon", "beacon"]);
  expect(set.current().replicas.map((replica) => replica.value)).toEqual([["beacon", "zebra"], ["beacon", "zebra"]]);
  expect(set.current().messages).toEqual([]);
  dispatch(set, { type: "remove", replica: "B", value: "beacon" });
  expect(dispatch(set, { type: "deliver", message: "m1:B:A" }).replicas.map((replica) => replica.value))
    .toEqual([["zebra"], ["zebra"]]);
});
