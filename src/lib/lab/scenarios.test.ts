import { expect, test } from "vitest";
import type { LabAction } from "./contract";
import { createEngine } from "./engine-registry";
import { presentFrame } from "./present-frame";
import {
  buildScenarioRegistry,
  dotsPresentation,
  scenarioById,
  scenarioIds,
  scenarioTrace,
  followsReference,
} from "./scenarios";

test("registers all seven trail scenarios", () => {
  expect(scenarioIds()).toEqual([
    "dots-concurrent-add-remove", "lamport-ordering-concurrency-limit", "local-history-message-observation",
    "mv-register-concurrent-writes-observed-resolution", "or-set-concurrent-add-remove-stale-replay",
    "partial-order-comparison", "vector-clock-comparisons",
  ]);
  expect(scenarioById("dots-concurrent-add-remove")).toEqual({
    id: "dots-concurrent-add-remove",
    kind: "dots",
    replicas: ["A", "B"],
    initialValues: [],
    actions: [
      { type: "add", replica: "A", value: "beacon" },
      { type: "deliver", message: "m1:A:B" },
      { type: "partition", left: "A", right: "B" },
      { type: "remove", replica: "A", value: "beacon" },
      { type: "add", replica: "B", value: "beacon" },
      { type: "heal", left: "A", right: "B" },
      { type: "deliver", message: "m2:A:B" },
      { type: "deliver", message: "m3:B:A" },
    ],
    presentation: dotsPresentation,
  });
});

test.each([
  ["mv-register-concurrent-writes-observed-resolution", 6, "An observed write replaces both siblings"],
  ["or-set-concurrent-add-remove-stale-replay", 10, "The concurrent add survives stale replay"],
] as const)("replays %s without concluding before its evidence", (id, steps, heading) => {
  const scenario = scenarioById(id);
  const trace = scenarioTrace(id);
  expect(trace).toHaveLength(steps + 1);
  for (const frame of trace.slice(0, -1)) {
    expect(presentFrame(frame, trace, scenario.presentation).outcome).toBeNull();
    expect(scenario.actions?.[frame.index]).toBeDefined();
  }
  const final = trace.at(-1)!;
  expect(final.invariants.converged).toBe(true);
  expect(presentFrame(final, trace, scenario.presentation).outcome?.heading).toBe(heading);
  expect(presentFrame(final, [final], scenario.presentation).outcome).toBeNull();
});

test.each(scenarioIds().filter((id) => id !== "dots-concurrent-add-remove")
  .flatMap((id) => [0, 1].map((deviationIndex) => ({ id, deviationIndex }))))(
  "$id requires reset after deviation at index $deviationIndex even when the latest action matches",
  ({ id, deviationIndex }) => {
    const scenario = scenarioById(id);
    const engine = createEngine(scenario);
    const actions = scenario.actions!;
    const dispatch = (action: LabAction) => {
      const result = engine.dispatch(action);
      if ("message" in result) throw new Error(result.message);
      return result;
    };
    const onReference = (history = engine.history()) =>
      followsReference(engine.current(), history, actions);
    expect(onReference()).toBe(true);
    for (const action of actions.slice(0, deviationIndex)) dispatch(action);
    dispatch(scenario.kind === "mv-register"
      ? { type: "write", replica: "B", value: "red" }
      : scenario.kind === "or-set"
        ? { type: "add", replica: "A", value: "other" }
        : { type: "local-event", replica: "B" });
    expect(onReference()).toBe(false);
    dispatch(actions[deviationIndex + 1]);
    expect(engine.current().action).toEqual(actions[deviationIndex + 1]);
    if (scenario.kind === "mv-register" && deviationIndex === 0) {
      expect(engine.current().messages.some((message) => message.id === "m1:A:B")).toBe(false);
    }
    expect(onReference()).toBe(false);
    expect(onReference([engine.current()])).toBe(false);
    dispatch({ type: "reset" });
    for (const action of actions) {
      expect(onReference()).toBe(true);
      expect(onReference(engine.history().slice(0, -1))).toBe(false);
      dispatch(action);
    }
    expect(onReference()).toBe(true);
  },
);

test.each(["missing", "toString", "__proto__"])("rejects unknown scenario %s", (id) => {
  expect(() => scenarioById(id)).toThrow(
    `Unknown lab scenario: ${id}`,
  );
});

test("rejects duplicate IDs before constructing the scenario registry", () => {
  const scenario = scenarioById("dots-concurrent-add-remove");
  expect(() => buildScenarioRegistry([scenario, { ...scenario }])).toThrow(
    "Duplicate scenario ID: dots-concurrent-add-remove",
  );
});

test("stores and rejects duplicate __proto__ scenario IDs", () => {
  const scenario = {
    ...scenarioById("dots-concurrent-add-remove"),
    id: "__proto__",
  };
  const registry = buildScenarioRegistry([scenario]);

  expect(Object.getPrototypeOf(registry)).toBeNull();
  expect(Object.hasOwn(registry, "__proto__")).toBe(true);
  expect(registry.__proto__.id).toBe("__proto__");
  expect(() => buildScenarioRegistry([scenario, { ...scenario }])).toThrow(
    "Duplicate scenario ID: __proto__",
  );
});
