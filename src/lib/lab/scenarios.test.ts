import { expect, test } from "vitest";
import { scenarioById, scenarioIds } from "./scenarios";

test("publishes the Dots proof scenario", () => {
  expect(scenarioIds()).toEqual(["dots-concurrent-add-remove"]);
  expect(scenarioById("dots-concurrent-add-remove")).toEqual({
    id: "dots-concurrent-add-remove",
    replicas: ["A", "B"],
    initialValues: [],
  });
});

test("rejects an unknown scenario", () => {
  expect(() => scenarioById("missing")).toThrow(
    "Unknown lab scenario: missing",
  );
});
