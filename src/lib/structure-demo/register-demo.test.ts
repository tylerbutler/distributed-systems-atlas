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
  test("LWW keeps the write with the greater sequence number", () => {
    const delivered = state(deliverRegisterOperations(
      state(stageRegisterRace(createRegisterDemo("lww-register"))),
    ));
    expect(delivered.view.replicas.map(({ values }) => values))
      .toEqual([["Trail closed"], ["Trail closed"], ["Trail closed"]]);
    expect(delivered.view).toMatchObject({ winnerAuthor: "B", timestamp: 2 });
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

  test("RegisterMap retains atomic and latest reads", () => {
    const staged = state(stageRegisterRace(createRegisterDemo("register-map")));
    expect(staged.view.replicas.map(({ values }) => values)).toEqual([[], [], []]);
    const delivered = state(deliverRegisterOperations(staged));
    expect(delivered.view).toMatchObject({
      atomicValue: "Trail open",
      latestValue: "Trail closed",
      versions: ["Trail open", "Trail closed"],
    });
    expect(delivered.view.replicas.map(({ values }) => values)).toEqual([
      ["radio-channel: Channel 4", "trail-status: Trail open"],
      ["radio-channel: Channel 4", "trail-status: Trail open"],
      ["radio-channel: Channel 4", "trail-status: Trail open"],
    ]);
  });

  test("RegisterMap accepts a caught-up write for one key", () => {
    const raced = state(deliverRegisterOperations(
      state(stageRegisterRace(createRegisterDemo("register-map"))),
    ));
    const updated = state(updateRegisterReplica(raced, {
      author: "C",
      key: "trail-status",
      value: "Inspect bridge",
    }));
    expect(state(deliverRegisterOperations(updated)).view).toMatchObject({
      atomicValue: "Inspect bridge",
      latestValue: "Inspect bridge",
      versions: ["Inspect bridge"],
    });
  });

  test("accepts another client write while a report is pending", () => {
    const alice = state(updateRegisterReplica(createRegisterDemo("mv-register"), {
      author: "A",
      key: "trail-status",
      value: "Trail open",
    }));
    const carol = state(updateRegisterReplica(alice, {
      author: "C",
      key: "trail-status",
      value: "Inspect bridge",
    }));
    expect(carol.queuedOperations).toHaveLength(2);
    expect(state(deliverRegisterOperations(carol)).view.replicas[1]?.values)
      .toEqual(["Inspect bridge", "Trail open"]);
  });
});
