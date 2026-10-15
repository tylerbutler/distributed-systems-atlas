import { expect, test } from "vitest";
import { add, createOrSet, merge, remove, type Result } from "@atlas/toolkit";
import { policyFrame, policyKind } from "./policy-comparisons";

const three = (values: string[]) => [values, values, values];

test("whole totals lose an increment while G-counter components keep both exactly once", () => {
  expect(policyFrame("counter", 0).left).toEqual(three(["0"]));
  expect(policyFrame("counter", 0).right).toEqual(three(["0"]));
  expect(policyFrame("counter", 1).left).toEqual([["7"], ["3"], ["0"]]);
  expect(policyFrame("counter", 1).right).toEqual([["7"], ["3"], ["0"]]);
  const delivered = policyFrame("counter", 2);
  expect(delivered.left).toEqual(three(["3"]));
  expect(delivered.right).toEqual(three(["10"]));
  expect(policyFrame("counter", 3).right).toEqual(delivered.right);
  expect(delivered.rightEvidence).toContain('"count":7');
  expect(delivered.rightEvidence).toContain('"count":3');
});

test("the same reports produce one LWW winner and two concurrent MV identities", () => {
  expect(policyFrame("register", 0).left).toEqual(three([]));
  expect(policyFrame("register", 1).left).toEqual([["Trail open"], ["Trail closed"], []]);
  expect(policyFrame("register", 1).right).toEqual([["Trail open"], ["Trail closed"], []]);
  const delivered = policyFrame("register", 2);
  expect(delivered.left).toEqual(three(["Trail closed"]));
  expect(delivered.right).toEqual(three(["Trail closed", "Trail open"]));
  expect(delivered.leftEvidence).toContain("timestamp: 2");
  expect(delivered.rightEvidence).toContain('"replicaId":"A"');
  expect(delivered.rightEvidence).toContain('"replicaId":"B"');
});

test("a new addition after an observed removal is distinct from concurrent add", () => {
  const removed = policyFrame("readd", 1);
  expect(removed.left).toEqual(three([]));
  expect(removed.right).toEqual(three([]));
  expect(policyFrame("readd", 2).left).toEqual(three([]));
  expect(policyFrame("readd", 2).right).toEqual(three(["Eagle Creek"]));
  expect(policyFrame("readd", 0).left).toEqual(three(["Eagle Creek"]));
});

test("replaying the original addition only resurrects the membership-only toy", () => {
  const removed = policyFrame("replay", 1);
  expect(removed.left).toEqual(three([]));
  expect(removed.right).toEqual(three([]));
  const replayed = policyFrame("replay", 2);
  expect(replayed.left).toEqual(three(["Eagle Creek"]));
  expect(replayed.right).toEqual(three([]));
  expect(replayed.rightEvidence).toContain('"replicaId":"A","counter":1');
  expect(policyFrame("replay", 0).right).toEqual(three(["Eagle Creek"]));
});

test("invalid kinds and steps fail explicitly", () => {
  expect(() => policyKind("unknown")).toThrow("Unknown policy comparison");
  expect(() => policyFrame("counter", -1)).toThrow("Invalid policy comparison step");
  expect(() => policyFrame("replay", 3)).toThrow("Invalid policy comparison step");
});

test("the same old addition stays removed under reversed and repeated delivery", () => {
  const unwrap = <T>(result: Result<T>): T => {
    if (!result.ok) throw new Error(result.error.message);
    return result.value;
  };
  const addition = unwrap(add(unwrap(createOrSet("A")), "Eagle Creek"));
  const removal = unwrap(remove(addition.state, "Eagle Creek"));
  for (const operations of [
    [addition.operation, removal.operation, addition.operation, addition.operation],
    [removal.operation, addition.operation, removal.operation, addition.operation],
  ]) {
    let state = unwrap(createOrSet("C"));
    for (const operation of operations) {
      const merged = unwrap(merge(state, operation));
      if (merged.kind !== "or-set") throw new Error("Expected OR-set");
      state = merged;
    }
    expect(state.entries).toEqual([]);
    expect(state.tombstones).toEqual([{ replicaId: "A", counter: 1 }]);
  }
});
