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
    expect(presentFrame(frame, trace, scenario.presentation).controls.some((control) =>
      control.kind === "action" && control.label.startsWith(`Reference step ${frame.index + 1}:`))).toBe(true);
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
    const referenceControls = (history = engine.history()) =>
      presentFrame(engine.current(), history, scenario.presentation).controls.filter((control) =>
        control.kind === "action" && control.label.startsWith("Reference step "));
    expect(referenceControls()).toHaveLength(1);
    for (const action of actions.slice(0, deviationIndex)) dispatch(action);
    dispatch(scenario.kind === "mv-register"
      ? { type: "write", replica: "B", value: "red" }
      : scenario.kind === "or-set"
        ? { type: "add", replica: "A", value: "other" }
        : { type: "local-event", replica: "B" });
    expect(referenceControls()).toEqual([]);
    dispatch(actions[deviationIndex + 1]);
    expect(engine.current().action).toEqual(actions[deviationIndex + 1]);
    if (scenario.kind === "mv-register" && deviationIndex === 0) {
      expect(engine.current().messages.some((message) => message.id === "m1:A:B")).toBe(false);
    }
    expect(referenceControls()).toEqual([]);
    expect(referenceControls([engine.current()])).toEqual([]);
    dispatch({ type: "reset" });
    for (const action of actions) {
      expect(referenceControls()).toEqual([expect.objectContaining({ action, reason: "" })]);
      expect(referenceControls(engine.history().slice(0, -1))).toEqual([]);
      dispatch(action);
    }
    expect(referenceControls()).toEqual([]);
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
