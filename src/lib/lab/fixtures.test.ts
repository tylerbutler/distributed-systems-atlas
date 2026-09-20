import { describe, expect, test } from "vitest";
import { createCausalEngine } from "./causal-engine";
import { compareVectors, type LabAction } from "./contract";
import { acceptanceFixtures } from "./fixtures";
import { scenarioById } from "./scenarios";

describe("acceptance fixtures", () => {
  test("publishes the seven canonical traces in trail order", () => {
    expect(acceptanceFixtures.map(({ id, topic }) => ({ id, topic }))).toEqual([
      { id: "local-history-message-observation", topic: "local history and message observation" },
      { id: "partial-order-comparison", topic: "partial-order comparison" },
      {
        id: "lamport-ordering-concurrency-limit",
        topic: "Lamport-clock ordering and its concurrency limitation",
      },
      {
        id: "vector-clock-comparisons",
        topic: "vector-clock before/after/equal/concurrent comparisons",
      },
      { id: "dots-concurrent-add-remove", topic: "Dots concurrent add/remove" },
      {
        id: "mv-register-concurrent-writes-observed-resolution",
        topic: "multi-value register concurrent writes and observed resolution",
      },
      {
        id: "or-set-concurrent-add-remove-stale-replay",
        topic: "observed-remove set concurrent add/remove and stale replay",
      },
    ]);
  });

  test("keeps every trace complete and implementation-neutral", () => {
    for (const fixture of acceptanceFixtures) {
      expect(fixture.actions.length).toBeGreaterThan(0);
      expect(new Set(fixture.actions.map((action) => action.id)).size).toBe(fixture.actions.length);
      expect(Object.keys(fixture.expected.visibleState).length).toBeGreaterThan(0);
      expect(Object.keys(fixture.expected.causalMetadata).length).toBeGreaterThan(0);
      expect(Array.isArray(fixture.expected.messages)).toBe(true);
      expect(Object.keys(fixture.expected.invariants).length).toBeGreaterThan(0);
      expect(Object.values(fixture.expected.invariants).every(Boolean)).toBe(true);
      const checkpoints = "checkpoints" in fixture.expected ? fixture.expected.checkpoints : [];
      for (const checkpoint of checkpoints) {
        expect(fixture.actions.some((action) => action.id === checkpoint.afterAction)).toBe(true);
        expect(Object.keys(checkpoint.visibleState).length).toBeGreaterThan(0);
        expect(Object.keys(checkpoint.causalMetadata).length).toBeGreaterThan(0);
      }
    }
  });

  test("retains concurrent MV-register siblings until an observed write resolves them", () => {
    const fixture = acceptanceFixtures[5];
    const checkpoint = fixture.expected.checkpoints[0];

    expect(checkpoint.afterAction).toBe("deliver-blue");
    expect(checkpoint.visibleState).toEqual({
      A: { values: ["red", "blue"] },
      B: { values: ["red", "blue"] },
    });

    for (const replica of ["A", "B"] as const) {
      const metadata = checkpoint.causalMetadata[replica];
      expect(metadata.context).toEqual({ A: 1, B: 1 });
      expect(metadata.versions).toEqual({
        red: { A: 1, B: 0 },
        blue: { A: 0, B: 1 },
      });
      expect(compareVectors(metadata.versions.red, metadata.versions.blue)).toBe("concurrent");
    }

    expect(fixture.expected.visibleState).toEqual({
      A: { values: ["green"] },
      B: { values: ["green"] },
    });
  });

  test("records all four vector relations with the shared comparison rule", () => {
    const fixture = acceptanceFixtures[3];
    for (const action of fixture.actions) {
      const { left, right } = action.input;
      expect(compareVectors(left, right))
        .toBe(fixture.expected.visibleState[action.id]);
    }
  });

  test("replays the approved Dots proof without changing its engine contract", () => {
    const fixture = acceptanceFixtures[4];
    const engine = createCausalEngine(scenarioById(fixture.id));

    for (const action of fixture.actions) {
      let engineAction: LabAction;
      switch (action.type) {
        case "add":
        case "remove":
          engineAction = {
            type: action.type,
            replica: action.input.replica,
            value: action.input.value,
          };
          break;
        case "deliver":
          engineAction = { type: action.type, message: action.input.message };
          break;
        case "partition":
        case "heal":
          engineAction = {
            type: action.type,
            left: action.input.left,
            right: action.input.right,
          };
          break;
      }
      const result = engine.dispatch(engineAction);
      if ("message" in result) throw new Error(result.message);
    }

    const frame = engine.current();
    expect(Object.fromEntries(frame.replicas.map((replica) => [
      replica.id,
      {
        values: replica.value,
        liveDots: replica.dots.map((dot) => `${dot.replica}:${dot.counter}`),
      },
    ]))).toEqual(fixture.expected.visibleState);
    expect(Object.fromEntries(frame.replicas.map((replica) => [
      replica.id,
      { context: replica.context },
    ]))).toEqual(Object.fromEntries(Object.entries(fixture.expected.causalMetadata).map(
      ([replica, metadata]) => [replica, { context: metadata.context }],
    )));
    expect(frame.messages).toEqual(fixture.expected.messages);
    expect(frame.invariants).toEqual({
      uniqueDots: fixture.expected.invariants.uniqueDots,
      removedDotsStayRemoved: fixture.expected.invariants.removedDotsStayRemoved,
      converged: fixture.expected.invariants.converged,
    });
  });
});
