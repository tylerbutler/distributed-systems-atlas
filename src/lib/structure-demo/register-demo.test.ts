import { describe, expect, test } from "vitest";
import {
  createRegisterDemo,
  deliverRegisterOperations,
  stageRegisterRace,
  updateRegisterReplica,
  type RegisterDemoResult,
} from "./register-demo";

function state(result: RegisterDemoResult) {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error);
  return result.state;
}

describe("register demos", () => {
  test("LWW resolves an equal-time race by author", () => {
    const delivered = state(deliverRegisterOperations(
      state(stageRegisterRace(createRegisterDemo("lww-register"))),
    ));
    expect(delivered.view.replicas.map(({ values }) => values))
      .toEqual([["Trail closed"], ["Trail closed"], ["Trail closed"]]);
    expect(delivered.view).toMatchObject({ winnerAuthor: "B", timestamp: 10 });
  });

  test("MV preserves concurrent alternatives", () => {
    const delivered = state(deliverRegisterOperations(
      state(stageRegisterRace(createRegisterDemo("mv-register"))),
    ));
    expect(delivered.view.replicas.map(({ values }) => values)).toEqual([
      ["Trail closed", "Trail open"],
      ["Trail closed", "Trail open"],
      ["Trail closed", "Trail open"],
    ]);
  });

  test("RegisterCollection retains atomic and latest reads", () => {
    const staged = state(stageRegisterRace(createRegisterDemo("register-collection")));
    expect(staged.view.replicas.map(({ values }) => values)).toEqual([[], [], []]);
    expect(state(deliverRegisterOperations(staged)).view).toMatchObject({
      atomicValue: "Trail open",
      latestValue: "Trail closed",
      versions: ["Trail open", "Trail closed"],
    });
  });

  test("accepts another client write while a report is pending", () => {
    const alice = state(updateRegisterReplica(createRegisterDemo("mv-register"), {
      author: "A",
      value: "Trail open",
    }));
    const carol = state(updateRegisterReplica(alice, {
      author: "C",
      value: "Inspect bridge",
    }));
    expect(carol.queuedOperations).toHaveLength(2);
    expect(state(deliverRegisterOperations(carol)).view.replicas[1]?.values)
      .toEqual(["Inspect bridge", "Trail open"]);
  });
});
