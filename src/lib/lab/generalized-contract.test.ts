import { describe, expect, test } from "vitest";
import { immutable, type LabAction, type Observation, type TraceFrame } from "./contract";
import { createEngine } from "./engine-registry";
import { presentFrame, type LabPresentation } from "./present-frame";
import { scenarioById } from "./scenarios";

const presentation: LabPresentation = {
  title: "Observation lab",
  instructions: "Create an event.",
  comparisonHeading: "Event comparison",
  inspectorNote: "Recorded algorithm metadata.",
  invariantLabels: { valid: "Valid observation" },
  valueLabel: (replica) => replica.value.join(", ") || "No values",
  controls: () => [
    { kind: "action", label: "Record at A", action: { type: "local-event", replica: "A" }, reason: "" },
    { kind: "notice", text: "Only local knowledge is shown." },
  ],
  compare: () => null,
  announce: () => "",
  complete: () => null,
};

function frame(observation: Observation): TraceFrame {
  return immutable({
    index: 0, action: null, actionLabel: "initial", explanation: "Initial state.",
    replicas: [{ id: "A", value: [], ...observation }],
    messages: [{ id: "m1:A:B", from: "A", to: "B", kind: "event", ...observation }],
    partitions: [], invariants: { valid: true },
  });
}

describe("generalized observation and presentation contract", () => {
  test.each<Observation>([
    { observation: "history", events: [{ id: "a1", predecessors: [] }], observed: ["a1"] },
    { observation: "scalar-clock", clock: 3 },
    { observation: "vector-clock", clock: { A: 1, B: 2 } },
    { observation: "dots", clock: { A: 1 }, dots: [{ replica: "A", counter: 1 }], context: { A: 1 } },
    { observation: "mv-register", siblings: [
      { value: "red", version: { A: 1 } }, { value: "red", version: { B: 1 } },
    ], context: { A: 1, B: 1 } },
    { observation: "or-set", members: [
      { value: "beacon", dots: [{ replica: "B", counter: 1 }], removed: [{ replica: "A", counter: 1 }] },
    ], context: { A: 1, B: 1 } },
  ])("presents and freezes $observation without fabricated Dots fields", (observation) => {
    const input = frame(observation);
    const view = presentFrame(input, [input], presentation);
    expect(view.title).toBe("Observation lab");
    expect(view.controls).toEqual(presentation.controls(input));
    expect(view.replicas[0].details.length).toBeGreaterThan(0);
    expect(view.messages[0].details.length).toBeGreaterThan(2);
    expect(view.invariants[0].label).toBe("Valid observation");
    expect(view.comparison).toBeNull();
    if (observation.observation !== "dots" && observation.observation !== "or-set") {
      expect(view.replicas[0].details.map((entry) => entry.label)).not.toContain("Live dots");
    }
    const checkFrozen = (value: unknown): void => {
      if (value && typeof value === "object") {
        expect(Object.isFrozen(value)).toBe(true);
        Object.values(value).forEach(checkFrozen);
      }
    };
    checkFrozen(input);
  });

  test("preserves equal-valued register siblings with different versions", () => {
    const view = presentFrame(frame({
      observation: "mv-register",
      siblings: [{ value: "red", version: { A: 1 } }, { value: "red", version: { B: 1 } }],
      context: { A: 1, B: 1 },
    }), [], presentation);
    expect(view.replicas[0].details).toContainEqual({
      label: "Register siblings", value: "red [A:1]; red [B:1]",
    });
  });

  test("retains local predecessors and observed history as separate fields", () => {
    const view = presentFrame(frame({
      observation: "history", events: [{ id: "b1", predecessors: ["a1"] }], observed: ["a1", "b1"],
    }), [], presentation);
    expect(view.replicas[0].details).toEqual([
      { label: "Visible value", value: "No values" },
      { label: "Local history", value: "b1" },
      { label: "Observed events", value: "a1, b1" },
      { label: "Predecessors", value: "b1: a1" },
    ]);
  });

  test("retains per-member live and removed dots in replica and message fields", () => {
    const view = presentFrame(frame({
      observation: "or-set",
      members: [{ value: "beacon", dots: [{ replica: "B", counter: 1 }], removed: [{ replica: "A", counter: 1 }] }],
      context: { B: 1, A: 1 },
    }), [], presentation);
    const metadata = [
      { label: "Set membership", value: "beacon [B:1]" },
      { label: "Removed dots", value: "beacon [A:1]" },
      { label: "Causal context", value: "A:1, B:1" },
    ];
    expect(view.replicas[0].details.slice(1)).toEqual(metadata);
    expect(view.messages[0].details.slice(2)).toEqual(metadata);
  });

  test("passes only the selected history prefix to lesson rules", () => {
    const initial = frame({ observation: "scalar-clock", clock: 0 });
    const future = { ...initial, index: 1 };
    const view = presentFrame(initial, [initial, future], {
      ...presentation,
      complete: (_frame, history) => history.some((entry) => entry.index === 1)
        ? { heading: "Future", explanation: "Must not appear." } : null,
    });
    expect(view.outcome).toBeNull();
  });
});

describe("engine registry", () => {
  test("creates Dots from scenario metadata and records typed actions immutably", () => {
    const scenario = scenarioById("dots-concurrent-add-remove");
    expect(scenario.kind).toBe("dots");
    const engine = createEngine(scenario);
    const action: LabAction = { type: "add", replica: "A", value: "beacon" };
    const result = engine.dispatch(action);
    expect(result).toHaveProperty("action", action);
    expect(engine.current().replicas[0]).toHaveProperty("observation", "dots");
    expect(Object.isFrozen(engine.current().action)).toBe(true);
    expect(Object.isFrozen(action)).toBe(false);
    expect(engine.current().action).not.toBe(action);
    Reflect.set(action, "value", "changed");
    expect(engine.current().action).toEqual({ type: "add", replica: "A", value: "beacon" });
  });

  test.each(["mv-register", "or-set"] as const)("creates a distinct %s engine", (kind) => {
    const engine = createEngine({ ...scenarioById("dots-concurrent-add-remove"), kind });
    expect(engine.current().replicas.every((replica) => replica.observation === kind)).toBe(true);
  });

  test.each(["toString", "__proto__", "missing"])("rejects invalid runtime engine kind %s", (kind) => {
    expect(() => Reflect.apply(createEngine, undefined, [{ ...scenarioById("dots-concurrent-add-remove"), kind }]))
      .toThrow(`No engine registered for kind: ${kind}`);
  });

  test.each<LabAction>([
    { type: "local-event", replica: "A" },
    { type: "send", from: "A", to: "B" },
    { type: "write", replica: "A", value: "red" },
    { type: "compare-events", pairs: [["a1", "b1"]] },
    { type: "compare-vectors", left: { A: 1 }, right: { B: 1 } },
  ])("returns LabError for unsupported $type without changing history", (action) => {
    const engine = createEngine(scenarioById("dots-concurrent-add-remove"));
    const previous = engine.current();
    const result = engine.dispatch(action);
    expect(result).toEqual({
      action, engine: "dots-concurrent-add-remove",
      message: `unsupported action for dots: ${action.type}`, lastFrame: previous,
    });
    expect(engine.current()).toBe(previous);
    expect(engine.history()).toEqual([previous]);
  });
});
