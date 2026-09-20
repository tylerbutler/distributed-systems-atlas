import { describe, expect, test } from "vitest";
import { createCausalEngine } from "./causal-engine";
import type { TraceFrame, VersionVector } from "./contract";
import { presentFrame } from "./present-frame";

function frame(left: VersionVector = { A: 2 }, right: VersionVector = { A: 1, B: 1 }): TraceFrame {
  return {
    index: 4,
    actionLabel: "B added beacon",
    explanation: "B created dot B:1",
    replicas: [
      { id: "A", value: ["beacon"], clock: left, dots: [{ replica: "A", counter: 2 }], context: { A: 1 } },
      { id: "B", value: ["beacon"], clock: right, dots: [{ replica: "B", counter: 1 }], context: { A: 1 } },
    ],
    messages: [],
    partitions: ["A:B"],
    invariants: { uniqueDots: true, removedDotsStayRemoved: true, converged: false },
  };
}

describe("presentFrame", () => {
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
    const input: TraceFrame = {
      ...frame(),
      replicas: [{
        id: "B", value: [], clock: { B: 10, A: 2 },
        dots: [{ replica: "B", counter: 1 }, { replica: "A", counter: 10 }, { replica: "A", counter: 2 }],
        context: { B: 0, A: 0 },
      }, frame().replicas[0], {
        id: "C", value: [], clock: {}, dots: [], context: {},
      }],
      messages: [{
        id: "m1:B:A:copy2", from: "B", to: "A", kind: "delta",
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
    expect(presented.replicas[1]).toMatchObject({
      valueLabel: "Empty set", clockLabel: "A:2, B:10",
      dotLabels: ["A:2", "A:10", "B:1"], contextLabel: "A:0, B:0",
      hasObservedEvents: false, canRemoveBeacon: false,
    });
    expect(presented.replicas[2]).toMatchObject({
      clockLabel: "Empty vector", dotLabels: [], contextLabel: "Empty vector",
    });
    expect(presented.messages[0]).toMatchObject({
      id: "m1:B:A:copy2", routeLabel: "m1 copy2 from B to A", blocked: true,
      payloadLabel: "delta; live dots: A:2, A:10, B:1; causal context: A:10, B:1",
      dotLabels: ["A:2", "A:10", "B:1"], contextLabel: "A:10, B:1",
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
    expect(presented.replicas[0]).toMatchObject({
      valueLabel: "beacon", clockLabel: "A:1, B:0", dotLabels: ["A:1"],
      hasObservedEvents: true, canRemoveBeacon: true,
    });
    expect(presented.messages).toEqual([]);
    expect(engine.current()).toBe(initial);
    expect(engine.history()).toEqual([initial]);
    engine.dispatch({ type: "add", replica: "B", value: "beacon" });
    const added = presentFrame(engine.current());
    expect(added.announcement).toContain("B created dot B:1");
    expect(added.messages[0]).toMatchObject({ blocked: false, dotLabels: ["B:1"] });
    engine.dispatch({ type: "remove", replica: "A", value: "beacon" });
    expect(presentFrame(engine.current()).messages[1]).toMatchObject({
      dotLabels: [], payloadLabel: "delta; live dots: No live dots; causal context: A:1, B:0",
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
