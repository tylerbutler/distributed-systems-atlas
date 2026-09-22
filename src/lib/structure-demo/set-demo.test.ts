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

test("OR-set additions receive the next local dot", () => {
  const bob = state(updateSetReplica(createSetDemo("or-set"), {
    author: "B",
    action: "add",
    element: "Eagle Creek",
  }));
  expect(bob.queuedOperations).toEqual([{
    author: "B",
    action: "add",
    element: "Eagle Creek",
    tag: "B:2",
  }]);
  expect(bob.orSetNotebooks?.B).toEqual({
    additions: [
      { element: "Eagle Creek", tag: "A:1" },
      { element: "Eagle Creek", tag: "B:2" },
    ],
    removals: [],
    highestTagNumber: 2,
  });
});

test("the OR-set race records complete notebook pages", () => {
  const staged = state(stageSetDemoRace(createSetDemo("or-set")));
  expect(staged.queuedOperations).toEqual([
    {
      author: "A",
      action: "remove",
      element: "Eagle Creek",
      observedTags: ["A:1"],
    },
    {
      author: "B",
      action: "add",
      element: "Eagle Creek",
      tag: "B:2",
    },
  ]);

  const delivered = state(deliverSetDemoOperations(staged));
  for (const notebook of Object.values(delivered.orSetNotebooks ?? {})) {
    expect(notebook).toEqual({
      additions: [{ element: "Eagle Creek", tag: "B:2" }],
      removals: [{ element: "Eagle Creek", tag: "A:1" }],
      highestTagNumber: 2,
    });
  }
});
