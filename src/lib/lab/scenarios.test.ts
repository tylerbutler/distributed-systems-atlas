import { expect, test } from "vitest";
import { dotsPresentation, scenarioById, scenarioIds } from "./scenarios";

test("publishes the Dots proof scenario", () => {
  expect(scenarioIds()).toEqual([
    "dots-concurrent-add-remove", "lamport-ordering-concurrency-limit", "local-history-message-observation",
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

test.each(["missing", "toString", "__proto__"])("rejects unknown scenario %s", (id) => {
  expect(() => scenarioById(id)).toThrow(
    `Unknown lab scenario: ${id}`,
  );
});
