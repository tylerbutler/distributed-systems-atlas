import { expect, test } from "vitest";
import {
  add, createMvRegister, createOrSet, inspect, merge, remove, write,
  type Change, type Operation, type Result, type State,
} from "@tylerbutler/watershed-atlas";
import type { Dot, LabAction, SimulationEngine, TraceFrame } from "../contract";
import { createEngine } from "../engine-registry";
import { acceptanceFixtures } from "../fixtures";

const fixtures = [acceptanceFixtures[4], acceptanceFixtures[5], acceptanceFixtures[6]] as const;
type FixtureAction = typeof fixtures[number]["actions"][number];

function unwrap<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

function action(input: FixtureAction): LabAction {
  switch (input.type) {
    case "write":
    case "add":
    case "remove":
      return { type: input.type, replica: input.input.replica, value: input.input.value };
    case "deliver":
    case "duplicate":
      return { type: input.type, message: input.input.message };
    case "partition":
    case "heal":
      return { type: input.type, left: input.input.left, right: input.input.right };
  }
}

function dispatch(engine: SimulationEngine, input: LabAction): TraceFrame {
  const frame = engine.dispatch(input);
  if ("message" in frame) throw new Error(frame.message);
  return frame;
}

function replay(fixture: typeof fixtures[number], kind: "mv-register" | "or-set") {
  const engine = createEngine({ id: fixture.id, kind, replicas: ["A", "B"], initialValues: [] });
  const states = new Map<string, State>(["A", "B"].map((id) =>
    [id, unwrap<State>(kind === "mv-register" ? createMvRegister(id) : createOrSet(id))]));
  const messages = new Map<string, { to: string; operation: Operation }>();
  let operation = 0;
  let copy = 0;
  const checkpoints = new Map<string, TraceFrame>();
  for (const input of fixture.actions) {
    const next = action(input);
    switch (next.type) {
      case "write":
      case "add":
      case "remove": {
        const state = states.get(next.replica)!;
        const change = unwrap<Change>(next.type === "write" ? write(state, next.value)
          : next.type === "add" ? add(state, next.value) : remove(state, next.value));
        states.set(next.replica, change.state);
        operation++;
        for (const to of states.keys()) {
          if (to !== next.replica) messages.set(`m${operation}:${next.replica}:${to}`, { to, operation: change.operation });
        }
        break;
      }
      case "duplicate":
        messages.set(`${next.message}:copy${++copy}`, messages.get(next.message)!);
        break;
      case "deliver": {
        const message = messages.get(next.message)!;
        states.set(message.to, unwrap(merge(states.get(message.to)!, message.operation)));
        messages.delete(next.message);
        break;
      }
    }
    const frame = dispatch(engine, next);
    checkpoints.set(input.id, frame);
    for (const replica of frame.replicas) {
      const actual = unwrap(inspect(states.get(replica.id)!));
      expect(replica.value).toEqual(actual.values);
      if (replica.observation === "mv-register" && actual.causal.kind === "mv-register") {
        expect(replica.siblings.map((sibling) => sibling.value)).toEqual(actual.causal.entries.map((entry) => entry.value));
        expect(replica.context).toEqual(Object.fromEntries(["A", "B"].map((id) =>
          [id, actual.causal.kind === "mv-register" ? actual.causal.clock.find((tag) => tag.replicaId === id)?.counter ?? 0 : 0])));
      } else if (replica.observation === "or-set" && actual.causal.kind === "or-set") {
        expect(replica.members.filter((member) => member.dots.length).map((member) => ({
          value: member.value, tags: member.dots.map((dot) => ({ replicaId: dot.replica, counter: dot.counter })),
        }))).toEqual(actual.causal.entries);
        expect(replica.members.flatMap((member) => member.removed).map((dot) => ({
          replicaId: dot.replica, counter: dot.counter,
        }))).toEqual(actual.causal.tombstones);
      } else throw new Error("Adapter and package kinds differ");
    }
    expect(frame.messages.map((message) => message.id)).toEqual([...messages.keys()]);
    expect(frame.partitions).toEqual(next.type === "partition" ? ["A:B"]
      : next.type === "heal" ? [] : engine.history().at(-2)!.partitions);
  }
  return { engine, checkpoints };
}

test("canonical MV fixture agrees with the package at every step, including the two-sibling checkpoint", () => {
  const fixture = acceptanceFixtures[5];
  const { engine, checkpoints } = replay(fixture, "mv-register");
  for (const expected of [...fixture.expected.checkpoints, {
    afterAction: fixture.actions.at(-1)!.id,
    visibleState: fixture.expected.visibleState,
    causalMetadata: fixture.expected.causalMetadata,
  }]) {
    const frame = checkpoints.get(expected.afterAction)!;
    for (const id of ["A", "B"] as const) {
      const replica = frame.replicas.find((replica) => replica.id === id)!;
      if (replica.observation !== "mv-register") throw new Error("Expected register");
      expect([...replica.value].sort()).toEqual([...expected.visibleState[id].values].sort());
      expect({
        context: replica.context,
        versions: Object.fromEntries(replica.siblings.map((sibling) => [sibling.value, sibling.version])),
      }).toEqual(expected.causalMetadata[id]);
    }
  }
  const siblingFrame = checkpoints.get("deliver-blue")!;
  expect(siblingFrame.invariants.converged).toBe(true);
  expect(siblingFrame.replicas[0].value).toHaveLength(2);
  expect(engine.current().messages).toEqual(fixture.expected.messages);
  expect(engine.current().invariants.converged).toBe(fixture.expected.invariants.converged);
  const superseded = siblingFrame.replicas[0];
  if (superseded.observation !== "mv-register") throw new Error("Expected register");
  expect(superseded.siblings.map((sibling) => {
    const [id, counter] = Object.entries(sibling.version).find(([, counter]) => counter > 0)!;
    return `${sibling.value}@${id}:${counter}`;
  })).toEqual(fixture.expected.causalMetadata.superseded);
});

// The kernels use different allocators: Watershed's B:2 is the fixture's first B add, B:1.
const fixtureDot = (dot: Dot): Dot => dot.replica === "B" && dot.counter === 2 ? { ...dot, counter: 1 } : dot;
const key = (dot: Dot) => `${dot.replica}:${dot.counter}`;

test.each([acceptanceFixtures[4], acceptanceFixtures[6]])("$id preserves canonical membership and tag identities", (fixture) => {
  const { engine, checkpoints } = replay(fixture, "or-set");
  const frame = engine.current();
  for (const id of ["A", "B"] as const) {
    const replica = frame.replicas.find((replica) => replica.id === id)!;
    if (replica.observation !== "or-set") throw new Error("Expected set");
    const live = replica.members.flatMap((member) => member.dots);
    const removed = replica.members.flatMap((member) => member.removed);
    expect(live).toEqual([{ replica: "B", counter: 2 }]);
    expect(removed).toEqual([{ replica: "A", counter: 1 }]);
    expect(replica.context).toEqual({ A: 1, B: 2 });
    expect({ values: replica.value, liveDots: live.map(fixtureDot).map(key) }).toEqual(fixture.expected.visibleState[id]);
    const metadata = {
      context: { A: replica.context.A, B: fixtureDot({ replica: "B", counter: replica.context.B }).counter },
      removedDots: removed.map(fixtureDot).map(key),
    };
    expect(metadata).toMatchObject({
      context: fixture.expected.causalMetadata[id].context,
      removedDots: fixture.expected.causalMetadata[id].removedDots,
    });
    if ("additions" in fixture.expected.causalMetadata[id]) {
      expect([...live, ...removed].map(fixtureDot).map(key).sort())
        .toEqual(fixture.expected.causalMetadata[id].additions);
    }
  }
  expect(frame.messages).toEqual(fixture.expected.messages);
  expect(frame.invariants).toMatchObject({
    removeTargetsOnlyObservedDots: true, concurrentAddSurvives: true,
    removedDotsStayRemoved: true, converged: true,
  });
  if (fixture.id === acceptanceFixtures[6].id) {
    expect(frame.replicas).toEqual(checkpoints.get("deliver-add")!.replicas);
  }
});

test("Dots agrees with Watershed on the overlapping OR-set fixture, not allocator numbering", () => {
  const fixture = acceptanceFixtures[4];
  const dots = createEngine({ id: fixture.id, kind: "dots", replicas: ["A", "B"], initialValues: [] });
  const { engine } = replay(fixture, "or-set");
  for (const [index, input] of fixture.actions.entries()) {
    const reference = dispatch(dots, action(input));
    const packaged = engine.history()[index + 1];
    expect(reference.messages.map((message) => message.id)).toEqual(packaged.messages.map((message) => message.id));
    expect(reference.partitions).toEqual(packaged.partitions);
    for (const [index, replica] of reference.replicas.entries()) {
      const other = packaged.replicas[index];
      if (replica.observation !== "dots" || other.observation !== "or-set") throw new Error("Unexpected kind");
      expect(other.value).toEqual(replica.value);
      expect(other.members.flatMap((member) => member.dots).map(fixtureDot)).toEqual(replica.dots);
      expect({ A: other.context.A, B: fixtureDot({ replica: "B", counter: other.context.B }).counter })
        .toEqual(replica.context);
    }
    expect(packaged.invariants.converged).toBe(reference.invariants.converged);
  }
});
