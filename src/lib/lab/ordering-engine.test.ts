import { describe, expect, test, vi } from "vitest";
import type { LabAction, OrderingMode, SimulationEngine, TraceFrame } from "./contract";
import { createEngine } from "./engine-registry";
import { acceptanceFixtures } from "./fixtures";
import { compareEvents, createOrderingEngine, lamportOrder } from "./ordering-engine";
import { presentFrame } from "./present-frame";
import { scenarioById, scenarioTrace } from "./scenarios";

const ids = acceptanceFixtures.slice(0, 4).map((fixture) => fixture.id);
const modes: OrderingMode[] = ["history", "partial-order", "lamport", "vector"];

function create(mode: OrderingMode, replicas = ["A", "B", "C"]) {
  return createOrderingEngine({ id: "test", kind: "ordering", orderingMode: mode, replicas, initialValues: [] });
}

function dispatch(engine: SimulationEngine, action: LabAction): TraceFrame {
  const result = engine.dispatch(action);
  if ("message" in result) throw new Error(result.message);
  return result;
}

function events(frame: TraceFrame) {
  if (!frame.ordering) throw new Error("Missing ordering trace");
  return frame.ordering.events;
}

function replay(id: string) {
  const scenario = scenarioById(id);
  const engine = createEngine(scenario);
  for (const action of scenario.actions ?? []) dispatch(engine, action);
  return engine;
}

describe("canonical ordering fixtures", () => {
  test("local history includes only local events and delivered observations", () => {
    const fixture = acceptanceFixtures[0];
    const engine = replay(fixture.id);
    const frame = engine.current();
    expect(Object.fromEntries(frame.replicas.map((replica) => {
      if (replica.observation !== "history") throw new Error("Expected history");
      return [replica.id, { history: replica.events.map((event) => event.id), observed: replica.observed }];
    }))).toEqual(fixture.expected.visibleState);
    expect(Object.fromEntries(events(frame).map((event) => [event.id, event.predecessors])))
      .toEqual(fixture.expected.causalMetadata.predecessors);
    for (const [pair, relation] of Object.entries(fixture.expected.causalMetadata.relations)) {
      const [left, right] = pair.split(":");
      expect(compareEvents(events(frame), left, right)).toBe(relation);
    }
    const queued = engine.history().flatMap((entry) => entry.messages).find((message) => message.id === "m1");
    expect(queued).toMatchObject({
      id: "m1", from: "A", to: "B", observation: "history", observed: ["a1"],
    });
    expect(frame.messages).toEqual([]);
    expect(frame.replicas.every((replica) => replica.observation === "history"
      && replica.observed.length < events(frame).length)).toBe(true);
  });

  test("partial order comes from graph paths, including reverse and equality comparisons", () => {
    const fixture = acceptanceFixtures[1];
    const frame = replay(fixture.id).current();
    expect(Object.fromEntries(frame.replicas.map((replica) => {
      if (replica.observation !== "history") throw new Error("Expected history");
      return [replica.id, { history: replica.events.map((event) => event.id) }];
    }))).toEqual({
      A: fixture.expected.visibleState.A, B: fixture.expected.visibleState.B, C: fixture.expected.visibleState.C,
    });
    expect(Object.fromEntries(frame.ordering!.comparisons.map(({ left, right, relation }) =>
      [`${left}:${right}`, relation]))).toEqual(fixture.expected.visibleState.comparisons);
    expect(events(frame).flatMap((event) => event.predecessors.map((id) => [id, event.id])))
      .toEqual(fixture.expected.causalMetadata.edges);
    for (const [left, right] of fixture.expected.causalMetadata.concurrent) {
      expect(compareEvents(events(frame), left, right)).toBe("concurrent");
    }
    expect(compareEvents(events(frame), "b1", "a1")).toBe("after");
  });

  test("Lamport rules match the fixture without claiming scalar order is causality", () => {
    const fixture = acceptanceFixtures[2];
    const engine = replay(fixture.id);
    const frame = engine.current();
    const graph = events(frame);
    expect(Object.fromEntries(frame.replicas.map((replica) => {
      if (replica.observation !== "scalar-clock") throw new Error("Expected scalar clock");
      return [replica.id, {
        clock: replica.clock,
        history: graph.filter((event) => event.replica === replica.id).map((event) => `${event.id}@${event.lamport}`),
      }];
    }))).toEqual({ A: fixture.expected.visibleState.A, B: fixture.expected.visibleState.B });
    expect(lamportOrder(graph).map((event) => `${event.id}@${event.lamport}/${event.replica}`))
      .toEqual(fixture.expected.visibleState.totalOrder);
    expect(Object.fromEntries(graph.map((event) => [event.id, event.lamport])))
      .toEqual(fixture.expected.causalMetadata.timestamps);
    for (const [left, right] of fixture.expected.causalMetadata.happensBefore) {
      expect(compareEvents(graph, left, right)).toBe("before");
      expect(graph.find((event) => event.id === left)!.lamport)
        .toBeLessThan(graph.find((event) => event.id === right)!.lamport!);
    }
    for (const [left, right] of fixture.expected.causalMetadata.concurrent) {
      expect(compareEvents(graph, left, right)).toBe("concurrent");
    }
    expect(engine.history().flatMap((entry) => entry.messages).find((message) => message.id === "m1"))
      .toMatchObject({ observation: "scalar-clock", clock: fixture.expected.messages[0].payload.lamport });
  });

  test("vector comparisons use canonical inputs and preserve all four results", () => {
    const fixture = acceptanceFixtures[3];
    const frame = replay(fixture.id).current();
    expect(frame.ordering!.vectorComparisons).toEqual(fixture.actions.map((action) => ({
      ...action.input, relation: fixture.expected.visibleState[action.id],
    })));
    for (const action of fixture.actions) {
      expect(action.input).toEqual(fixture.expected.causalMetadata[action.id]);
    }
    expect(frame.messages).toEqual(fixture.expected.messages);
  });

  test.each(ids)("shares %s actions and snapshots between replay and the guided run", (id) => {
    const scenario = scenarioById(id);
    const engine = createEngine(scenario);
    expect(scenario.actions?.length).toBeGreaterThan(0);
    for (const action of scenario.actions ?? []) {
      dispatch(engine, action);
    }
    expect(scenarioTrace(id)).toEqual(engine.history());
    const view = presentFrame(engine.current(), engine.history(), scenario.presentation);
    expect(view.outcome).not.toBeNull();
    expect(presentFrame(engine.history()[0], engine.history(), scenario.presentation).outcome).toBeNull();
    expect(view.replicas.flatMap((replica) => replica.details).map((detail) => detail.label)).not.toContain("Live dots");
    expect(view.invariants.every((invariant) => invariant.passed)).toBe(true);
  });
});

describe.each(modes)("%s reference engine", (mode) => {
  test("retains send-time knowledge across reordering, duplicate receives, and partitions", () => {
    const engine = create(mode);
    dispatch(engine, { type: "local-event", replica: "A", event: "a1", value: "first" });
    dispatch(engine, { type: "send", from: "A", to: "B", event: "s1", message: "m1" });
    const oldMessage = engine.current().messages[0];
    dispatch(engine, { type: "duplicate", message: "m1" });
    dispatch(engine, { type: "partition", left: "B", right: "A" });
    dispatch(engine, { type: "local-event", replica: "A", event: "a2", value: "later" });
    dispatch(engine, { type: "send", from: "A", to: "B", event: "s2", message: "m2" });
    const before = engine.current();
    expect(engine.dispatch({ type: "deliver", message: "m2" })).toMatchObject({
      message: "message crosses an active partition", lastFrame: before,
    });
    expect(engine.current()).toBe(before);
    dispatch(engine, { type: "heal", left: "A", right: "B" });
    expect(engine.current().messages).toHaveLength(3);
    dispatch(engine, { type: "deliver", message: "m2", event: "b1" });
    dispatch(engine, { type: "deliver", message: "m1:copy1", event: "b2" });
    const frame = dispatch(engine, { type: "deliver", message: "m1", event: "b3" });
    const graph = events(frame);
    expect(compareEvents(graph, "a2", "b1")).toBe("before");
    expect(compareEvents(graph, "b1", "b3")).toBe("before");
    expect(graph.filter((event) => event.replica === "B").map((event) => event.id)).toEqual(["b1", "b2", "b3"]);
    expect(engine.history().every((entry) => Object.values(entry.invariants).every(Boolean))).toBe(true);
    expect(oldMessage).toEqual(engine.history()[2].messages[0]);
    expect(frame.messages).toEqual([]);
    const atC = frame.replicas.find((replica) => replica.id === "C")!;
    expect(atC.value).toEqual([]);
    if (atC.observation === "history") expect(atC.observed).toEqual([]);
    if (atC.observation === "scalar-clock") expect(atC.clock).toBe(0);
    if (atC.observation === "vector-clock") expect(atC.clock).toEqual({ A: 0, B: 0, C: 0 });
  });

  test("reset restores all counters, queues, partitions, comparison results, and frozen history", () => {
    const engine = create(mode);
    const initial = engine.current();
    const actions: LabAction[] = [
      { type: "local-event", replica: "A", value: "one" },
      { type: "send", from: "A", to: "B" },
      { type: "duplicate", message: "m1" },
      { type: "deliver", message: "m1" },
      { type: "partition", left: "A", right: "B" },
    ];
    actions.forEach((action) => dispatch(engine, action));
    const history = engine.history();
    expect(dispatch(engine, { type: "reset" })).toEqual(initial);
    expect(engine.history()).toEqual([initial]);
    actions.forEach((action) => dispatch(engine, action));
    expect(engine.history()).toEqual(history);
    const other = create(mode, ["C", "B", "A"]);
    actions.forEach((action) => dispatch(other, action));
    expect(other.history()).toEqual(history);
    const checkFrozen = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(checkFrozen);
      }
    };
    checkFrozen(history);
    expect(Object.isFrozen(actions[0])).toBe(false);
  });

  test("rejects invalid and unsupported actions without changing state or consuming IDs", () => {
    const engine = create(mode);
    const clean = create(mode);
    const setup: LabAction[] = [
      { type: "local-event", replica: "A", event: "a1" },
      { type: "send", from: "A", to: "B", message: "m1" },
    ];
    for (const target of [engine, clean]) setup.forEach((action) => dispatch(target, action));
    const invalid: LabAction[] = [
      { type: "local-event", replica: "missing" },
      { type: "local-event", replica: "A", event: "a1" },
      { type: "send", from: "A", to: "missing" },
      { type: "send", from: "A", to: "A" },
      { type: "send", from: "A", to: "B", message: "m1" },
      { type: "deliver", message: "missing" },
      { type: "deliver", message: "m1", event: "a1" },
      { type: "duplicate", message: "missing" },
      { type: "partition", left: "A", right: "A" },
      { type: "heal", left: "A", right: "missing" },
      { type: "compare-events", pairs: [["a1", "a1"], ["a1", "missing"]] },
      { type: "add", replica: "A", value: "unsupported" },
      { type: "compare-vectors", left: { A: -1 }, right: {} },
    ];
    for (const action of invalid) {
      const previous = engine.current();
      const history = engine.history();
      expect(engine.dispatch(action)).toMatchObject({ action, engine: "test", lastFrame: previous });
      expect(engine.current()).toBe(previous);
      expect(engine.history()).toBe(history);
    }
    const followup: LabAction[] = [
      { type: "deliver", message: "m1", event: "b1" },
      { type: "local-event", replica: "C" },
      { type: "send", from: "C", to: "B" },
      { type: "duplicate", message: "m2" },
    ];
    for (const target of [engine, clean]) followup.forEach((action) => dispatch(target, action));
    expect(engine.history()).toEqual(clean.history());
  });
});

test("transitive message forwarding does not reveal later source events", () => {
  const engine = create("history");
  const actions: LabAction[] = [
    { type: "local-event", replica: "A", event: "a1" },
    { type: "send", from: "A", to: "B" },
    { type: "deliver", message: "m1", event: "b1" },
    { type: "send", from: "B", to: "C" },
    { type: "local-event", replica: "A", event: "a2" },
    { type: "deliver", message: "m2", event: "c1" },
  ];
  actions.forEach((action) => dispatch(engine, action));
  expect(engine.current().replicas[2]).toMatchObject({ observed: ["a1", "b1", "c1"] });
  expect(compareEvents(events(engine.current()), "a1", "c1")).toBe("before");
  expect(compareEvents(events(engine.current()), "a2", "c1")).toBe("concurrent");
});

test("vector send increments locally and receive merges then increments only the receiver", () => {
  const engine = create("vector");
  dispatch(engine, { type: "local-event", replica: "B", event: "b1" });
  dispatch(engine, { type: "local-event", replica: "A", event: "a1" });
  dispatch(engine, { type: "send", from: "A", to: "B", event: "a2" });
  expect(engine.current().messages[0]).toMatchObject({ clock: { A: 2, B: 0, C: 0 } });
  dispatch(engine, { type: "deliver", message: "m1", event: "b2" });
  expect(engine.current().replicas[1]).toMatchObject({ clock: { A: 2, B: 2, C: 0 } });
  expect(events(engine.current()).map((event) => event.vector)).toEqual([
    { A: 0, B: 1, C: 0 }, { A: 1, B: 0, C: 0 }, { A: 2, B: 0, C: 0 }, { A: 2, B: 2, C: 0 },
  ]);
  const input: LabAction = { type: "compare-vectors", left: { A: 1 }, right: { A: 1, B: 0 } };
  const result = dispatch(engine, input);
  expect(result.ordering!.vectorComparisons.at(-1)?.relation).toBe("equal");
  expect(Object.isFrozen(input.left)).toBe(false);
  Reflect.set(input.left, "A", 9);
  expect(result.action).toEqual({ type: "compare-vectors", left: { A: 1 }, right: { A: 1, B: 0 } });
  dispatch(engine, { type: "reset" });
  expect(engine.current().ordering!.vectorComparisons).toEqual([]);
});

test("vector metadata cost is visible and grows with replica count", () => {
  const presentation = scenarioById(ids[3]).presentation;
  for (const replicas of [["A", "B"], ["A", "B", "C", "D", "E"]]) {
    const engine = create("vector", replicas);
    const view = presentFrame(engine.current(), engine.history(), presentation);
    expect(view.replicas[0].details).toContainEqual({
      label: "Vector size", value: `${replicas.length} components per clock`,
    });
  }
});

test("live comparisons return to current clocks after a preset comparison", () => {
  const scenario = scenarioById(ids[3]);
  const engine = createEngine(scenario);
  dispatch(engine, { type: "compare-vectors", left: { A: 2 }, right: { B: 2 } });
  expect(scenario.presentation.compare(engine.current())?.relation).toBe("concurrent");
  dispatch(engine, { type: "local-event", replica: "A" });
  expect(scenario.presentation.compare(engine.current())?.relation).toBe("after");
});

test("ordering message copies retain distinct delivery labels", () => {
  const scenario = scenarioById(ids[0]);
  const engine = createEngine(scenario);
  dispatch(engine, { type: "send", from: "A", to: "B" });
  dispatch(engine, { type: "duplicate", message: "m1" });
  const view = presentFrame(engine.current(), engine.history(), scenario.presentation);
  expect(view.messages.map((message) => message.routeLabel)).toEqual([
    "m1 from A to B", "m1 copy1 from A to B",
  ]);
});

test("unrelated third-replica activity does not earn a later-source-event conclusion", () => {
  const presentation = scenarioById(ids[0]).presentation;
  const engine = create("history");
  dispatch(engine, { type: "local-event", replica: "A", event: "a1" });
  dispatch(engine, { type: "send", from: "A", to: "B" });
  dispatch(engine, { type: "local-event", replica: "C", event: "c1" });
  dispatch(engine, { type: "deliver", message: "m1", event: "b1" });
  expect(presentation.complete(engine.current(), engine.history())).toBeNull();
  dispatch(engine, { type: "local-event", replica: "A", event: "a2" });
  expect(presentation.complete(engine.current(), engine.history())).not.toBeNull();
});

test("Lamport receive uses a larger local clock, and duplicate arrivals tick again", () => {
  const engine = create("lamport");
  dispatch(engine, { type: "send", from: "A", to: "B", event: "a1" });
  dispatch(engine, { type: "duplicate", message: "m1" });
  for (let index = 0; index < 4; index++) dispatch(engine, { type: "local-event", replica: "B" });
  dispatch(engine, { type: "deliver", message: "m1", event: "b5" });
  expect(engine.current().replicas[1]).toMatchObject({ clock: 5 });
  dispatch(engine, { type: "deliver", message: "m1:copy1", event: "b6" });
  expect(engine.current().replicas[1]).toMatchObject({ clock: 6 });
});

test.each(modes)("button order does not create %s causal edges", (mode) => {
  const actions: LabAction[] = [
    { type: "local-event", replica: "A", event: "a1" },
    { type: "local-event", replica: "B", event: "b1" },
  ];
  const graphs = [actions, [...actions].reverse()].map((sequence) => {
    const engine = create(mode);
    sequence.forEach((action) => dispatch(engine, action));
    expect(compareEvents(events(engine.current()), "a1", "b1")).toBe("concurrent");
    return events(engine.current());
  });
  expect([...graphs[0]].sort((a, b) => a.id.localeCompare(b.id)))
    .toEqual([...graphs[1]].sort((a, b) => a.id.localeCompare(b.id)));
  if (mode === "lamport") expect(lamportOrder(graphs[0])).toEqual(lamportOrder(graphs[1]));
});

test("vector forwarding preserves every component and matches transitive graph paths", () => {
  const engine = create("vector", ["A", "B", "constructor"]);
  const actions: LabAction[] = [
    { type: "local-event", replica: "constructor", event: "c1" },
    { type: "send", from: "A", to: "B", event: "a1" },
    { type: "deliver", message: "m1", event: "b1" },
    { type: "send", from: "B", to: "constructor", event: "b2" },
    { type: "local-event", replica: "A", event: "a2" },
    { type: "deliver", message: "m2", event: "c2" },
  ];
  actions.forEach((action) => dispatch(engine, action));
  expect(engine.current().replicas[2]).toMatchObject({ clock: { A: 1, B: 2, constructor: 2 } });
  expect(compareEvents(events(engine.current()), "a1", "c2")).toBe("before");
  expect(compareEvents(events(engine.current()), "a2", "c2")).toBe("concurrent");
  expect(Object.values(engine.current().invariants).every(Boolean)).toBe(true);
});

test("event comparison snapshots do not freeze or retain caller-owned pairs", () => {
  const engine = create("partial-order");
  dispatch(engine, { type: "local-event", replica: "A", event: "a1" });
  dispatch(engine, { type: "local-event", replica: "B", event: "b1" });
  const pairs: [string, string][] = [["a1", "b1"]];
  const frame = dispatch(engine, { type: "compare-events", pairs });
  pairs[0][0] = "missing";
  expect(frame.action).toEqual({ type: "compare-events", pairs: [["a1", "b1"]] });
  dispatch(engine, { type: "reset" });
  expect(engine.current().ordering!.comparisons).toEqual([]);
});

test("immutable 200-event graphs build reachability once, without repeated predecessor traversal", () => {
  let predecessorReads = 0;
  let edgeTraversals = 0;
  const graph = Object.freeze(Array.from({ length: 200 }, (_, index) => {
    const predecessors = index === 0 ? [] : [`e${index - 1}`];
    Object.defineProperty(predecessors, Symbol.iterator, {
      value() {
        edgeTraversals++;
        return Array.prototype[Symbol.iterator].call(this);
      },
    });
    Object.freeze(predecessors);
    return Object.freeze({
      id: `e${index}`,
      get predecessors() { predecessorReads++; return predecessors; },
    });
  }));
  expect(compareEvents(graph, "e0", "e199")).toBe("before");
  const reads = predecessorReads;
  const traversals = edgeTraversals;
  expect(reads).toBeGreaterThan(0);
  expect(traversals).toBeGreaterThan(0);
  for (let index = 0; index < 200; index++) {
    expect(compareEvents(graph, `e${index}`, "e199")).toBe(index === 199 ? "equal" : "before");
    expect(compareEvents(graph, "e199", `e${index}`)).toBe(index === 199 ? "equal" : "after");
  }
  expect(predecessorReads).toBe(reads);
  expect(edgeTraversals).toBe(traversals);
});

test.each([20, 200])("comparison dispatches reuse reachability and invariants for %i events", (count) => {
  const engine = create("vector");
  for (let index = 0; index < count - 1; index++) {
    dispatch(engine, { type: "local-event", replica: index % 2 ? "B" : "A", event: `e${index}` });
  }
  dispatch(engine, { type: "send", from: "A", to: "B", message: "m1" });
  const before = engine.current();
  let graphBuilds = 0;
  const NativeMap = Map;
  class CountedMap<K, V> extends NativeMap<K, V> {
    constructor(entries?: readonly (readonly [K, V])[] | null) {
      super(entries);
      graphBuilds++;
    }
  }
  const traversal = vi.spyOn(Array.prototype, "pop");
  vi.stubGlobal("Map", CountedMap);
  let after: TraceFrame;
  let graphTraversals: number;
  try {
    engine.dispatch({ type: "compare-events", pairs: [["e0", "e2"], ["e2", "e0"], ["e0", "e0"], ["e0", "e1"]] });
    engine.dispatch({ type: "compare-vectors", left: { A: 1 }, right: { B: 1 } });
    engine.dispatch({ type: "duplicate", message: "m1" });
    engine.dispatch({ type: "partition", left: "A", right: "B" });
    engine.dispatch({ type: "heal", left: "A", right: "B" });
    after = engine.current();
    graphTraversals = traversal.mock.calls.length;
  } finally {
    vi.unstubAllGlobals();
    traversal.mockRestore();
  }
  expect(graphBuilds).toBe(0);
  expect(graphTraversals).toBe(0);
  expect(after.index).toBe(before.index + 5);
  expect(after.ordering!.events).toBe(before.ordering!.events);
  expect(after.invariants).toBe(before.invariants);
  expect(after.ordering!.comparisons.map(({ relation }) => relation)).toEqual(["before", "after", "equal", "concurrent"]);
  expect(after.ordering!.vectorComparisons.at(-1)?.relation).toBe("concurrent");
  const received = dispatch(engine, { type: "deliver", message: "m1", event: "received" });
  expect(received.ordering!.events).not.toBe(before.ordering!.events);
  expect(compareEvents(events(received), "e0", "received")).toBe("before");
  expect(() => compareEvents(events(before), "e0", "received")).toThrow("cannot compare unknown events");
  expect(Object.isFrozen(before.ordering!.events)).toBe(true);
  expect(before.ordering!.events.some((event) => event.id === "received")).toBe(false);
}, 30_000);

test("mutable or shallow-frozen graph inputs never retain stale reachability", () => {
  for (const [freezeArray, freezeEvents] of [[false, false], [true, false], [true, true]]) {
    const graph = [{ id: "a", predecessors: [] as string[] }, { id: "b", predecessors: [] as string[] }];
    if (freezeArray) Object.freeze(graph);
    if (freezeEvents) graph.forEach(Object.freeze);
    expect(compareEvents(graph, "a", "b")).toBe("concurrent");
    graph[1].predecessors.push("a");
    expect(compareEvents(graph, "a", "b")).toBe("before");
  }
});

test("reset can reuse event IDs without changing cached historical relations", () => {
  const engine = create("vector");
  dispatch(engine, { type: "local-event", replica: "A", event: "a" });
  const previous = dispatch(engine, { type: "local-event", replica: "B", event: "b" });
  expect(compareEvents(events(previous), "a", "b")).toBe("concurrent");
  dispatch(engine, { type: "reset" });
  expect(() => compareEvents(events(engine.current()), "a", "b")).toThrow("cannot compare unknown events");
  dispatch(engine, { type: "local-event", replica: "B", event: "a" });
  const next = dispatch(engine, { type: "local-event", replica: "B", event: "b" });
  expect(compareEvents(events(next), "a", "b")).toBe("before");
  expect(compareEvents(events(previous), "a", "b")).toBe("concurrent");
  expect(next.invariants).not.toBe(previous.invariants);
});

test.each([
  { replicas: [] }, { replicas: ["A", "A"] }, { replicas: ["A:B"] }, { replicas: [""] },
  { initialValues: ["unsupported"] }, { orderingMode: undefined },
])("rejects invalid ordering configuration %j", (overrides) => {
  expect(() => createOrderingEngine({
    id: "invalid", kind: "ordering", replicas: ["A", "B"], initialValues: [], orderingMode: "history", ...overrides,
  })).toThrow();
});
