import { describe, expect, test } from "vitest";
import {
  createMapDemo,
  deliverMapDemoOperations,
  stageMapDemoRace,
  updateMapReplica,
  type MapDemoResult,
} from "./map-demo";

function state(result: MapDemoResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe.each([
  ["shared-map", [
    { key: "bridge-status", value: "Inspection due" },
    { key: "gate-status", value: "Trail closed" },
  ]],
  ["lww-map", [{ key: "gate-status", value: "Trail closed" }]],
  ["or-map", [{ key: "Eagle Creek", value: "8" }]],
  ["shared-directory", [{ key: "eagle-creek", value: "folder" }]],
] as const)("%s demo", (kind, expected) => {
  test("converges all three replicas after its authored race", () => {
    const staged = state(stageMapDemoRace(createMapDemo(kind)));
    expect(staged.view.pending).toBe(true);
    const delivered = state(deliverMapDemoOperations(staged));
    expect(delivered.view.replicas.map(({ entries }) => entries))
      .toEqual([expected, expected, expected]);
  });
});

test("accepts another map write while delivery is pending", () => {
  const alice = state(updateMapReplica(createMapDemo("shared-map"), {
    author: "A",
    action: "set",
    key: "gate-status",
    value: "Trail open",
  }));
  const carol = state(updateMapReplica(alice, {
    author: "C",
    action: "set",
    key: "bridge-status",
    value: "Bridge clear",
  }));
  expect(carol.queuedOperations).toHaveLength(2);
  const delivered = state(deliverMapDemoOperations(carol));
  expect(delivered.view.replicas[1]?.entries)
    .toEqual([
      { key: "bridge-status", value: "Bridge clear" },
      { key: "gate-status", value: "Trail open" },
    ]);
  expect(delivered.result).toContain("Every hiker sees Bridge clear on that line.");
});

test("directory changes from any hiker merge without inventing missing folders", () => {
  let current = createMapDemo("shared-directory");
  for (const [author, key] of [["A", "eagle-creek"], ["B", "eagle-creek"], ["C", "ridge-pass"]] as const) {
    current = state(updateMapReplica(current, { author, action: "mkdir", key, value: "" }));
  }
  expect(current.view.replicas.map(({ entries }) => entries.map(({ key }) => key)))
    .toEqual([["eagle-creek"], ["eagle-creek"], ["ridge-pass"]]);
  current = state(deliverMapDemoOperations(current));
  expect(current.view.replicas.map(({ entries }) => entries.map(({ key }) => key)))
    .toEqual(Array(3).fill(["eagle-creek", "ridge-pass"]));

  current = state(updateMapReplica(current, { author: "C", action: "rmdir", key: "eagle-creek", value: "" }));
  current = state(deliverMapDemoOperations(current));
  expect(current.view.replicas.map(({ entries }) => entries.map(({ key }) => key)))
    .toEqual(Array(3).fill(["ridge-pass"]));
  expect(current.result).toContain("/ridge-pass");
  expect(current.result).not.toContain("/eagle-creek");

  const missing = updateMapReplica(current, { author: "A", action: "rmdir", key: "eagle-creek", value: "" });
  expect(missing.ok).toBe(false);
  expect(missing.state).toBe(current);
  current = state(updateMapReplica(current, { author: "B", action: "mkdir", key: "eagle-creek", value: "" }));
  current = state(deliverMapDemoOperations(current));
  expect(current.view.replicas.map(({ entries }) => entries.map(({ key }) => key)))
    .toEqual(Array(3).fill(["ridge-pass", "eagle-creek"]));
});
