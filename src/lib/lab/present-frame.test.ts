import { describe, expect, test } from "vitest";
import { createCausalEngine } from "./causal-engine";
import type { DotsObservation, LabAction, TraceFrame, VersionVector } from "./contract";
import { presentFrame as present } from "./present-frame";
import { dotsPresentation } from "./scenarios";

function presentFrame(frame: TraceFrame, history: readonly TraceFrame[] = []) {
  return present(frame, history, dotsPresentation);
}

function frame(left: VersionVector = { A: 2 }, right: VersionVector = { A: 1, B: 1 }): TraceFrame<DotsObservation> {
  return {
    index: 4,
    action: { type: "add", replica: "B", value: "beacon" },
    actionLabel: "B added beacon",
    explanation: "B created dot B:1",
    replicas: [
      { observation: "dots", id: "A", value: ["beacon"], clock: left, dots: [{ replica: "A", counter: 2 }], context: { A: 1 } },
      { observation: "dots", id: "B", value: ["beacon"], clock: right, dots: [{ replica: "B", counter: 1 }], context: { A: 1 } },
    ],
    messages: [],
    partitions: ["A:B"],
    invariants: { uniqueDots: true, removedDotsStayRemoved: true, converged: false },
  };
}

describe("presentFrame", () => {
  test("presents the earned add-wins conclusion only after both deltas arrive", () => {
    const engine = createCausalEngine({ id: "lesson", replicas: ["A", "B"], initialValues: [] });
    const actions: LabAction[] = [
      { type: "add", replica: "A", value: "beacon" },
      { type: "deliver", message: "m1:A:B" },
      { type: "partition", left: "A", right: "B" },
      { type: "remove", replica: "A", value: "beacon" },
      { type: "add", replica: "B", value: "beacon" },
      { type: "heal", left: "A", right: "B" },
      { type: "deliver", message: "m2:A:B" },
      { type: "deliver", message: "m3:B:A" },
    ];
    for (const action of actions) {
      expect(presentFrame(engine.current(), engine.history()).outcome).toBeNull();
      expect(engine.dispatch(action)).not.toHaveProperty("message");
    }
    expect(presentFrame(engine.current(), engine.history()).outcome).toEqual({
      heading: "The new B dot survives",
      explanation: "Both replicas retain B:1. A removed the dot it had observed, not B's concurrent add.",
    });
    const relabeled = engine.history().map((entry) => ({ ...entry, actionLabel: "Translated action" }));
    expect(presentFrame(relabeled.at(-1)!, relabeled).outcome).toEqual(
      presentFrame(engine.current(), engine.history()).outcome,
    );
    // Full history cannot leak a future conclusion into a selected earlier frame.
    expect(presentFrame(engine.history()[6], engine.history()).outcome).toBeNull();
  });

  test("a sequential re-add does not earn a concurrent-add conclusion", () => {
    const engine = createCausalEngine({ id: "sequential", replicas: ["A", "B"], initialValues: [] });
    const actions: LabAction[] = [
      { type: "add", replica: "A", value: "beacon" },
      { type: "deliver", message: "m1:A:B" },
      { type: "remove", replica: "A", value: "beacon" },
      { type: "deliver", message: "m2:A:B" },
      { type: "add", replica: "B", value: "beacon" },
      { type: "deliver", message: "m3:B:A" },
    ];
    for (const action of actions) expect(engine.dispatch(action)).not.toHaveProperty("message");
    expect(engine.current().invariants.converged).toBe(true);
    expect(presentFrame(engine.current(), engine.history()).outcome).toBeNull();
  });

  test("derives vector relation and announcement from one trace frame", () => {
    const presented = presentFrame(frame());
    expect(presented.comparison?.relation).toBe("concurrent");
    expect(presented.comparison?.evidence).toBe("A [A:2]; B [A:1, B:1]");
    expect(presented.announcement).toContain("B created dot B:1");
    expect(presented.announcement).toContain("A and B are concurrent");
  });

  test.each([
    [{}, { A: 0 }, "equal", "A and B are equal"],
    [{ A: 1 }, { B: 1, A: 1 }, "before", "A is before B"],
    [{ B: 1, A: 1 }, { A: 1 }, "after", "A is after B"],
    [{ A: 2 }, { B: 1, A: 1 }, "concurrent", "A and B are concurrent"],
  ] as const)("compares sparse clocks %j and %j", (left, right, relation, label) => {
    expect(presentFrame(frame(left, right)).comparison).toMatchObject({ relation, label });
  });

  test("sorts vectors and dots numerically without changing the trace", () => {
    const input: TraceFrame<DotsObservation> = {
      ...frame(),
      replicas: [{
        id: "B", value: [], clock: { B: 10, A: 2 },
        observation: "dots",
        dots: [{ replica: "B", counter: 1 }, { replica: "A", counter: 10 }, { replica: "A", counter: 2 }],
        context: { B: 0, A: 0 },
      }, frame().replicas[0], {
        id: "C", value: [], clock: {}, dots: [], context: {},
        observation: "dots",
      }],
      messages: [{
        id: "m1:B:A:copy2", from: "B", to: "A", kind: "delta",
        observation: "dots", clock: { B: 1, A: 10 },
        dots: [{ replica: "B", counter: 1 }, { replica: "A", counter: 10 }, { replica: "A", counter: 2 }],
        context: { B: 1, A: 10 },
      }],
    };
    const before = structuredClone(input);
    const freeze = (value: unknown): void => {
      if (value && typeof value === "object") {
        Object.values(value).forEach(freeze);
        Object.freeze(value);
      }
    };
    freeze(input);
    const presented = presentFrame(input);
    expect(presented.replicas.map(({ id, stationShape }) => [id, stationShape]))
      .toEqual([["A", "circle"], ["B", "diamond"], ["C", "hexagon"]]);
    expect(presented.replicas[1].details).toEqual([
      { label: "Visible value", value: "Empty set" },
      { label: "Live dots", value: "A:2, A:10, B:1" },
      { label: "Clock", value: "A:2, B:10" },
      { label: "Causal context", value: "A:0, B:0" },
    ]);
    expect(presented.replicas[1].emptyLabel).toBe("No events observed");
    expect(presented.controls).toContainEqual({
      kind: "action", label: "Remove beacon at B",
      action: { type: "remove", replica: "B", value: "beacon" }, reason: "No beacon is visible at this replica.",
    });
    expect(presented.replicas[2].details.map(({ value }) => value))
      .toEqual(["Empty set", "No live dots", "Empty vector", "Empty vector"]);
    expect(presented.messages[0]).toMatchObject({
      from: "B", to: "A",
      id: "m1:B:A:copy2", routeLabel: "m1 copy2 from B to A", blocked: true,
      payloadLabel: "delta; live dots: A:2, A:10, B:1; causal context: A:10, B:1",
      details: [
        { label: "Message ID", value: "m1:B:A:copy2" },
        { label: "Kind", value: "delta" },
        { label: "Live dots", value: "A:2, A:10, B:1" },
        { label: "Causal context", value: "A:10, B:1" },
      ],
    });
    expect(presented.links).toEqual([
      { left: "A", right: "B", partitioned: true },
      { left: "A", right: "C", partitioned: false },
      { left: "B", right: "C", partitioned: false },
    ]);
    expect(presented.invariants).toEqual([
      { id: "uniqueDots", label: "Unique dots", passed: true },
      { id: "removedDotsStayRemoved", label: "Removed dots stay removed", passed: true },
      { id: "converged", label: "Converged", passed: false },
    ]);
    expect(input).toEqual(before);
  });

  test("presents real engine frames without dispatching or changing history", () => {
    const engine = createCausalEngine({ id: "seeded", replicas: ["B", "A"], initialValues: ["beacon"] });
    const initial = engine.current();
    const presented = presentFrame(initial);
    expect(presented.replicas[0].details.map(({ value }) => value))
      .toEqual(["beacon", "A:1", "A:1, B:0", "A:1, B:0"]);
    expect(presented.replicas[0].emptyLabel).toBeNull();
    expect(presented.controls).toContainEqual({
      kind: "action", label: "Remove beacon at A",
      action: { type: "remove", replica: "A", value: "beacon" }, reason: "",
    });
    expect(presented.messages).toEqual([]);
    expect(engine.current()).toBe(initial);
    expect(engine.history()).toEqual([initial]);
    engine.dispatch({ type: "add", replica: "B", value: "beacon" });
    const added = presentFrame(engine.current());
    expect(added.announcement).toContain("B created dot B:1");
    expect(added.messages[0].blocked).toBe(false);
    expect(added.messages[0].details).toContainEqual({ label: "Live dots", value: "A:1, B:1" });
    engine.dispatch({ type: "remove", replica: "A", value: "beacon" });
    expect(presentFrame(engine.current()).messages[1]).toMatchObject({
      payloadLabel: "delta; live dots: No live dots; causal context: A:1, B:0",
    });
  });

  test("does not invent a peer for a single-replica engine", () => {
    const engine = createCausalEngine({ id: "solo", replicas: ["C"], initialValues: [] });
    const presented = presentFrame(engine.current());
    expect(presented.comparison).toBeNull();
    expect(presented.links).toEqual([]);
    expect(presented.announcement).toBe(engine.current().explanation);
  });
});
