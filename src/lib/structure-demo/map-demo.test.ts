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
  expect(delivered.result).toContain("Every notebook reads Bridge clear on that line.");
});
