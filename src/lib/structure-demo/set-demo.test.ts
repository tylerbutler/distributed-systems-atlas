import { describe, expect, test } from "vitest";
import {
  createSetDemo,
  deliverSetDemoOperations,
  stageSetDemoRace,
  updateSetReplica,
  type SetDemoKind,
  type SetDemoResult,
} from "./set-demo";

function state(result: SetDemoResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe.each([
  ["g-set", [["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"]]],
  ["two-p-set", [[], [], []]],
  ["or-set", [["Eagle Creek"], ["Eagle Creek"], ["Eagle Creek"]]],
] as const)("%s demo", (kind, expected) => {
  test("keeps all three replicas and converges after its authored race", () => {
    const staged = state(stageSetDemoRace(createSetDemo(kind as SetDemoKind)));
    expect(staged.view.replicas).toHaveLength(3);
    expect(staged.view.pending).toBe(true);
    const delivered = state(deliverSetDemoOperations(staged));
    expect(delivered.view.replicas.map(({ values }) => values)).toEqual(expected);
  });
});

test("accepts another client update while a report is pending", () => {
  const initial = createSetDemo("g-set");
  const alice = state(updateSetReplica(initial, {
    author: "A",
    action: "add",
    element: "Eagle Creek",
  }));
  const carol = state(updateSetReplica(alice, {
    author: "C",
    action: "add",
    element: "Marsh Loop",
  }));
  expect(carol.queuedOperations).toHaveLength(2);
  expect(state(deliverSetDemoOperations(carol)).view.replicas[1]?.values)
    .toEqual(["Eagle Creek", "Marsh Loop"]);
});

test("reset creates a fresh two-phase set", () => {
  const retired = state(deliverSetDemoOperations(
    state(stageSetDemoRace(createSetDemo("two-p-set"))),
  ));
  expect(retired.view.replicas[0]?.values).toEqual([]);
  expect(createSetDemo("two-p-set").view.replicas[0]?.values).toEqual(["Eagle Creek"]);
});
