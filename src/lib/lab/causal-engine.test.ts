import { describe, expect, test } from "vitest";
import { createCausalEngine } from "./causal-engine";
import type { DotsObservation, LabAction, SimulationEngine, TraceFrame } from "./contract";

function dispatch(engine: SimulationEngine<DotsObservation>, action: LabAction): TraceFrame<DotsObservation> {
  const result = engine.dispatch(action);
  if ("message" in result) throw new Error(result.message);
  return result;
}

function createEngine(replicas = ["A", "B"], initialValues: string[] = []) {
  return createCausalEngine({ id: "test", replicas, initialValues });
}

describe("causal engine", () => {
  test("preserves a concurrent add through an observed remove", () => {
    const engine = createCausalEngine({
      id: "dots-concurrent-add-remove",
      replicas: ["A", "B"],
      initialValues: [],
    });

    engine.dispatch({ type: "add", replica: "A", value: "beacon" });
    engine.dispatch({ type: "deliver", message: "m1:A:B" });
    engine.dispatch({ type: "partition", left: "A", right: "B" });
    engine.dispatch({ type: "remove", replica: "A", value: "beacon" });
    engine.dispatch({ type: "add", replica: "B", value: "beacon" });
    engine.dispatch({ type: "heal", left: "A", right: "B" });
    engine.dispatch({ type: "deliver", message: "m2:A:B" });
    const frame = engine.dispatch({ type: "deliver", message: "m3:B:A" });

    if ("message" in frame) throw new Error(frame.message);
    expect(frame.replicas.map((replica) => replica.value)).toEqual([
      ["beacon"],
      ["beacon"],
    ]);
    expect(frame.invariants.converged).toBe(true);
  });

  test("returns an error and retains the last frame for blocked delivery", () => {
    const engine = createCausalEngine({
      id: "blocked-delivery",
      replicas: ["A", "B"],
      initialValues: [],
    });
    engine.dispatch({ type: "add", replica: "A", value: "beacon" });
    engine.dispatch({ type: "partition", left: "A", right: "B" });

    const result = engine.dispatch({ type: "deliver", message: "m1:A:B" });
    expect("message" in result).toBe(true);
    if (!("message" in result)) return;
    expect(result.message).toBe("message crosses an active partition");
    expect(result.lastFrame.partitions).toEqual(["A:B"]);
  });

  test("seeds sorted, shared initial dots without queued operations", () => {
    const frame = createEngine(["B", "A"], ["zebra", "beacon", "beacon"]).current();
    expect(frame.index).toBe(0);
    expect(frame.messages).toEqual([]);
    expect(frame.partitions).toEqual([]);
    expect(frame.replicas).toEqual(
      ["A", "B"].map((id) => ({
        observation: "dots",
        id,
        value: ["beacon", "zebra"],
        clock: { A: 2, B: 0 },
        dots: [
          { replica: "A", counter: 1 },
          { replica: "A", counter: 2 },
        ],
        context: { A: 2, B: 0 },
      })),
    );
    expect(frame.invariants).toEqual({
      uniqueDots: true,
      removedDotsStayRemoved: true,
      converged: true,
    });
  });

  test("numbers only local operations and queues targets in lexical order", () => {
    const engine = createEngine(["C", "B", "A"]);
    const added = dispatch(engine, { type: "add", replica: "B", value: "beacon" });
    expect(added.messages).toEqual([
      {
        id: "m1:B:A", from: "B", to: "A", kind: "delta",
        observation: "dots", clock: { A: 0, B: 1, C: 0 },
        dots: [{ replica: "B", counter: 1 }], context: { A: 0, B: 1, C: 0 },
      },
      {
        id: "m1:B:C", from: "B", to: "C", kind: "delta",
        observation: "dots", clock: { A: 0, B: 1, C: 0 },
        dots: [{ replica: "B", counter: 1 }], context: { A: 0, B: 1, C: 0 },
      },
    ]);
    dispatch(engine, { type: "partition", left: "C", right: "B" });
    dispatch(engine, { type: "duplicate", message: "m1:B:A" });
    dispatch(engine, { type: "deliver", message: "m1:B:A" });
    const removed = dispatch(engine, { type: "remove", replica: "B", value: "beacon" });
    expect(removed.messages.map((message) => message.id)).toEqual([
      "m1:B:C", "m1:B:A:copy1", "m2:B:A", "m2:B:C",
    ]);
    expect(removed.replicas[1]).toEqual({
      id: "B", value: [], dots: [],
      observation: "dots",
      clock: { A: 0, B: 1, C: 0 }, context: { A: 0, B: 1, C: 0 },
    });
    expect(removed.messages[2].dots).toEqual([]);
    expect(removed.messages[2].context).toEqual({ A: 0, B: 1, C: 0 });
    expect(removed.invariants.converged).toBe(false);
  });

  test("delivers transitive causal payloads before exposing their vector maxima", () => {
    const engine = createEngine(["A", "B", "C"]);
    dispatch(engine, { type: "add", replica: "A", value: "first" });
    dispatch(engine, { type: "add", replica: "A", value: "second" });
    dispatch(engine, { type: "deliver", message: "m2:A:B" });
    dispatch(engine, { type: "add", replica: "B", value: "third" });
    let frame = dispatch(engine, { type: "deliver", message: "m3:B:C" });
    expect(frame.replicas[2].clock).toEqual({ A: 2, B: 1, C: 0 });
    expect(frame.replicas[2].value).toEqual(["first", "second", "third"]);
    frame = dispatch(engine, { type: "deliver", message: "m1:A:C" });
    expect(frame.replicas[2].clock).toEqual({ A: 2, B: 1, C: 0 });
    expect(frame.replicas[2].value).toEqual(["first", "second", "third"]);
    for (const message of frame.messages) {
      dispatch(engine, { type: "deliver", message: message.id });
    }
    expect(engine.current().invariants.converged).toBe(true);
    for (const replica of engine.current().replicas) {
      expect(replica.value).toEqual(["first", "second", "third"]);
      expect(replica.clock).toEqual({ A: 2, B: 1, C: 0 });
    }
  });

  test("an observed remove covers earlier additions even when their messages arrive last", () => {
    const engine = createEngine();
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "deliver", message: "m2:A:B" });
    dispatch(engine, { type: "remove", replica: "B", value: "beacon" });
    dispatch(engine, { type: "deliver", message: "m3:B:A" });
    const frame = dispatch(engine, { type: "deliver", message: "m1:A:B" });
    for (const replica of frame.replicas) {
      expect(replica.value).toEqual([]);
      expect(replica.dots).toEqual([]);
      expect(replica.context).toEqual({ A: 2, B: 0 });
    }
    expect(frame.invariants.converged).toBe(true);
  });

  test("carries causal dependencies across values and peers without removing a concurrent B addition", () => {
    const engine = createEngine(["A", "B", "C"]);
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "add", replica: "A", value: "other" });
    dispatch(engine, { type: "deliver", message: "m2:A:C" });
    dispatch(engine, { type: "remove", replica: "C", value: "beacon" });
    dispatch(engine, { type: "add", replica: "B", value: "beacon" });
    dispatch(engine, { type: "deliver", message: "m3:C:B" });
    dispatch(engine, { type: "deliver", message: "m3:C:A" });
    for (const message of engine.current().messages) {
      dispatch(engine, { type: "deliver", message: message.id });
    }
    for (const replica of engine.current().replicas) {
      expect(replica.value).toEqual(["beacon", "other"]);
      expect(replica.dots).toEqual([
        { replica: "A", counter: 2 }, { replica: "B", counter: 1 },
      ]);
    }
    expect(engine.current().invariants.converged).toBe(true);
  });

  test("an unrelated later addition carries observed removal knowledge to a third peer", () => {
    const engine = createEngine(["A", "B", "C"]);
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "remove", replica: "A", value: "beacon" });
    dispatch(engine, { type: "deliver", message: "m2:A:B" });
    dispatch(engine, { type: "add", replica: "B", value: "other" });
    dispatch(engine, { type: "deliver", message: "m3:B:C" });
    const frame = dispatch(engine, { type: "deliver", message: "m1:A:C" });
    expect(frame.replicas[2].value).toEqual(["other"]);
    expect(frame.replicas[2].dots).toEqual([{ replica: "B", counter: 1 }]);
  });

  test("never resurrects a removed dot when removal arrives before the add", () => {
    const engine = createEngine();
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "duplicate", message: "m1:A:B" });
    dispatch(engine, { type: "remove", replica: "A", value: "beacon" });
    dispatch(engine, { type: "deliver", message: "m2:A:B" });
    dispatch(engine, { type: "deliver", message: "m1:A:B:copy1" });
    const frame = dispatch(engine, { type: "deliver", message: "m1:A:B" });
    for (const replica of frame.replicas) {
      expect(replica.value).toEqual([]);
      expect(replica.dots).toEqual([]);
      expect(replica.context).toEqual({ A: 1, B: 0 });
    }
    expect(frame.invariants).toEqual({
      uniqueDots: true, removedDotsStayRemoved: true, converged: true,
    });
    expect(engine.history().every((entry) => entry.invariants.removedDotsStayRemoved)).toBe(true);
  });

  test("removing an unobserved value does not remove a concurrent add", () => {
    const engine = createEngine();
    dispatch(engine, { type: "remove", replica: "A", value: "beacon" });
    dispatch(engine, { type: "add", replica: "B", value: "beacon" });
    dispatch(engine, { type: "deliver", message: "m2:B:A" });
    const frame = dispatch(engine, { type: "deliver", message: "m1:A:B" });
    expect(frame.replicas.map((replica) => replica.value)).toEqual([["beacon"], ["beacon"]]);
    expect(frame.invariants.converged).toBe(true);
  });

  test("a re-add uses a fresh dot that survives old removal messages", () => {
    const engine = createEngine();
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "remove", replica: "A", value: "beacon" });
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "deliver", message: "m3:A:B" });
    dispatch(engine, { type: "deliver", message: "m2:A:B" });
    const frame = dispatch(engine, { type: "deliver", message: "m1:A:B" });
    for (const replica of frame.replicas) {
      expect(replica.value).toEqual(["beacon"]);
      expect(replica.dots).toEqual([{ replica: "A", counter: 2 }]);
    }
    expect(frame.invariants.converged).toBe(true);
  });

  test("removes every observed dot of only the selected value", () => {
    const engine = createEngine();
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "add", replica: "B", value: "beacon" });
    dispatch(engine, { type: "add", replica: "A", value: "keep" });
    dispatch(engine, { type: "deliver", message: "m2:B:A" });
    dispatch(engine, { type: "remove", replica: "A", value: "beacon" });
    for (const message of engine.current().messages) {
      dispatch(engine, { type: "deliver", message: message.id });
    }
    for (const replica of engine.current().replicas) {
      expect(replica.value).toEqual(["keep"]);
      expect(replica.dots).toEqual([{ replica: "A", counter: 2 }]);
      expect(replica.context).toEqual({ A: 2, B: 1 });
    }
    expect(engine.current().invariants.converged).toBe(true);
  });

  test("duplicates queued messages with monotonic suffixes and idempotent payloads", () => {
    const engine = createEngine();
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "duplicate", message: "m1:A:B" });
    dispatch(engine, { type: "duplicate", message: "m1:A:B" });
    const copied = dispatch(engine, { type: "duplicate", message: "m1:A:B:copy1" });
    expect(copied.messages.map((message) => message.id)).toEqual([
      "m1:A:B", "m1:A:B:copy1", "m1:A:B:copy2", "m1:A:B:copy1:copy3",
    ]);
    for (const message of copied.messages) {
      expect(message.dots).toEqual([{ replica: "A", counter: 1 }]);
      expect(message.context).toEqual({ A: 1, B: 0 });
      const frame = dispatch(engine, { type: "deliver", message: message.id });
      expect(frame.replicas[1].dots).toEqual([{ replica: "A", counter: 1 }]);
      expect(frame.invariants.uniqueDots).toBe(true);
    }
    expect(engine.current().invariants.converged).toBe(true);
    const last = engine.current();
    const history = engine.history();
    for (const type of ["deliver", "duplicate"] as const) {
      const action = { type, message: "m1:A:B" };
      expect(engine.dispatch(action)).toEqual({
        action, engine: "test", message: "unknown queued message: m1:A:B", lastFrame: last,
      });
      expect(engine.current()).toBe(last);
      expect(engine.history()).toBe(history);
    }
  });

  test("partitions are symmetric and healing unblocks only the selected link", () => {
    const engine = createEngine(["C", "A", "B"]);
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    dispatch(engine, { type: "partition", left: "C", right: "A" });
    dispatch(engine, { type: "partition", left: "B", right: "A" });
    const partitioned = dispatch(engine, { type: "partition", left: "A", right: "B" });
    expect(partitioned.partitions).toEqual(["A:B", "A:C"]);
    const history = engine.history();
    const action: LabAction = { type: "deliver", message: "m1:A:B" };
    const result = engine.dispatch(action);
    expect(result).toEqual({
      action, engine: "test", message: "message crosses an active partition",
      lastFrame: partitioned,
    });
    expect(engine.current()).toBe(partitioned);
    expect(engine.history()).toBe(history);
    dispatch(engine, { type: "heal", left: "B", right: "A" });
    const delivered = dispatch(engine, action);
    expect(delivered.partitions).toEqual(["A:C"]);
    expect(delivered.messages.map((message) => message.id)).toEqual(["m1:A:C"]);
    expect(delivered.replicas[1].value).toEqual(["beacon"]);
    dispatch(engine, { type: "heal", left: "A", right: "B" });
    expect(engine.current().partitions).toEqual(["A:C"]);
  });

  test.each<LabAction>([
    { type: "add", replica: "missing", value: "beacon" },
    { type: "remove", replica: "missing", value: "beacon" },
    { type: "deliver", message: "missing" },
    { type: "duplicate", message: "missing" },
    { type: "partition", left: "missing", right: "B" },
    { type: "partition", left: "A", right: "missing" },
    { type: "heal", left: "missing", right: "B" },
    { type: "heal", left: "A", right: "missing" },
    { type: "partition", left: "A", right: "A" },
    { type: "heal", left: "A", right: "A" },
  ])("rejects invalid action without state or counter changes: %j", (action) => {
    const engine = createEngine();
    const last = engine.current();
    const history = engine.history();
    const result = engine.dispatch(action);
    expect(result).toMatchObject({ action, engine: "test", lastFrame: last });
    if (!("message" in result)) throw new Error("expected a LabError");
    expect(result.message.length).toBeGreaterThan(0);
    expect(result.lastFrame).toBe(last);
    expect(engine.current()).toBe(last);
    expect(engine.history()).toBe(history);
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    const frame = dispatch(engine, { type: "duplicate", message: "m1:A:B" });
    expect(frame.messages.map((message) => message.id)).toEqual(["m1:A:B", "m1:A:B:copy1"]);
  });

  test("sorts values lexically and dots by replica then numeric counter", () => {
    const engine = createEngine(["b", "A"]);
    dispatch(engine, { type: "add", replica: "b", value: "a" });
    for (let index = 0; index < 12; index++) {
      dispatch(engine, { type: "add", replica: "A", value: index % 2 ? "Z" : "a" });
    }
    const queued = engine.current().messages.map((message) => message.id);
    expect(queued.slice(-4)).toEqual(["m10:A:b", "m11:A:b", "m12:A:b", "m13:A:b"]);
    for (const message of queued) dispatch(engine, { type: "deliver", message });
    const frame = engine.current();
    expect(frame.replicas.map((replica) => replica.id)).toEqual(["A", "b"]);
    for (const replica of frame.replicas) {
      expect(replica.value).toEqual(["Z", "a"]);
      expect(replica.dots.map((dot) => `${dot.replica}:${dot.counter}`)).toEqual([
        "A:1", "A:2", "A:3", "A:4", "A:5", "A:6", "A:7",
        "A:8", "A:9", "A:10", "A:11", "A:12", "b:1",
      ]);
    }
    expect(frame.invariants.converged).toBe(true);
  });

  test("does not equate matching values with convergence while deltas remain", () => {
    const engine = createEngine();
    dispatch(engine, { type: "add", replica: "A", value: "beacon" });
    const concurrent = dispatch(engine, { type: "add", replica: "B", value: "beacon" });
    expect(concurrent.replicas[0].value).toEqual(concurrent.replicas[1].value);
    expect(concurrent.invariants.converged).toBe(false);
    dispatch(engine, { type: "deliver", message: "m1:A:B" });
    const frame = dispatch(engine, { type: "deliver", message: "m2:B:A" });
    expect(frame.invariants.converged).toBe(true);
    expect(frame.replicas[0].dots).toEqual([
      { replica: "A", counter: 1 }, { replica: "B", counter: 1 },
    ]);
  });

  test("appends deeply immutable snapshots for all successful non-reset actions", () => {
    const engine = createEngine();
    const initialHistory = engine.history();
    const actions: LabAction[] = [
      { type: "add", replica: "A", value: "beacon" },
      { type: "duplicate", message: "m1:A:B" },
      { type: "partition", left: "A", right: "B" },
      { type: "heal", left: "B", right: "A" },
      { type: "deliver", message: "m1:A:B" },
      { type: "remove", replica: "B", value: "beacon" },
    ];
    const snapshots: string[] = [JSON.stringify(engine.current())];
    for (const [index, action] of actions.entries()) {
      const frame = dispatch(engine, action);
      expect(frame.index).toBe(index + 1);
      expect(frame.actionLabel.length).toBeGreaterThan(0);
      expect(frame.explanation.length).toBeGreaterThan(0);
      expect(engine.current()).toBe(frame);
      expect(engine.history().at(-1)).toBe(frame);
      snapshots.push(JSON.stringify(frame));
    }
    expect(initialHistory).toHaveLength(1);
    expect(engine.history().map((frame) => JSON.stringify(frame))).toEqual(snapshots);
    function assertFrozen(value: unknown): void {
      if (value === null || typeof value !== "object") return;
      expect(Object.isFrozen(value)).toBe(true);
      for (const child of Object.values(value)) assertFrozen(child);
    }
    assertFrozen(engine.history());
    const added = engine.history()[1];
    expect(Reflect.set(added.replicas[0].clock, "A", 999)).toBe(false);
    expect(Reflect.set(added.messages[0].dots[0], "counter", 999)).toBe(false);
    expect(Reflect.set(engine.history(), "0", {})).toBe(false);
    expect(JSON.stringify(added)).toBe(snapshots[1]);
  });

  test("reset restores the initial frame, history, seeds, and both ID counters", () => {
    const config = { id: "reset", replicas: ["B", "A"], initialValues: ["seed"] };
    const engine = createCausalEngine(config);
    const initial = engine.current();
    config.replicas.push("C");
    config.initialValues.push("not-a-seed");
    config.id = "changed";
    const actions: LabAction[] = [
      { type: "add", replica: "A", value: "beacon" },
      { type: "duplicate", message: "m1:A:B" },
      { type: "remove", replica: "B", value: "seed" },
      { type: "partition", left: "A", right: "B" },
    ];
    for (const action of actions) dispatch(engine, action);
    const previousHistory = engine.history();
    const before = JSON.stringify(previousHistory);
    expect(dispatch(engine, { type: "reset" })).toBe(initial);
    expect(engine.history()).toEqual([initial]);
    expect(engine.current().replicas[0].value).toEqual(["seed"]);
    for (const action of actions) dispatch(engine, action);
    expect(JSON.stringify(engine.history())).toBe(before);
    expect(JSON.stringify(previousHistory)).toBe(before);
    expect(engine.dispatch({ type: "deliver", message: "missing" })).toMatchObject({
      engine: "reset", lastFrame: engine.current(),
    });
  });

  test("replays identical traces independent of input array order", () => {
    const left = createEngine(["C", "B", "A"], ["zebra", "beacon"]);
    const right = createEngine(["A", "B", "C"], ["beacon", "zebra"]);
    const actions: LabAction[] = [
      { type: "add", replica: "C", value: "new" },
      { type: "duplicate", message: "m1:C:A" },
      { type: "remove", replica: "B", value: "beacon" },
      { type: "partition", left: "C", right: "B" },
      { type: "deliver", message: "m2:B:C" },
      { type: "heal", left: "B", right: "C" },
      { type: "deliver", message: "m2:B:C" },
    ];
    expect(left.current()).toEqual(right.current());
    for (const action of actions) expect(left.dispatch(action)).toEqual(right.dispatch(action));
    expect(JSON.stringify(left.history())).toBe(JSON.stringify(right.history()));
  });

  test("supports a single replica without manufacturing messages", () => {
    const engine = createEngine(["A"]);
    dispatch(engine, { type: "add", replica: "A", value: "" });
    expect(engine.current().replicas[0].value).toEqual([""]);
    const removed = dispatch(engine, { type: "remove", replica: "A", value: "" });
    expect(removed.replicas[0].value).toEqual([]);
    expect(removed.messages).toEqual([]);
    expect(removed.invariants.converged).toBe(true);
  });

  test.each([{ replicas: [] }, { replicas: ["A", "A"] }])("rejects invalid replica configuration: %j", ({ replicas }) => {
    expect(() => createEngine(replicas)).toThrow("replicas must be nonempty and unique");
  });

  test.each([
    { replicas: ["A", "B", "B:copy1"] },
    { replicas: ["A", "B:C", "A:B", "C"] },
  ])("rejects replica IDs that collide with message or partition delimiters: %j", ({ replicas }) => {
    expect(() => createEngine(replicas)).toThrow("replica IDs must not contain ':'");
  });
});
