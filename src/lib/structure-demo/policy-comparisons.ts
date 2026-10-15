import {
  add, createGCounter, createMapRoom, createMvRegister, createOrSet,
  createRegisterDemoRoom, createSetRoom, deliverMapOperations, deliverRegisterDemo,
  deliverSetOperations, incrementGCounter, merge, mergeGCounter, remove,
  stageRegisterDemoRace, updateMapRoom, updateSetRoom, write,
  type GCounter, type MvRegister, type Operation, type OrSet, type Result,
} from "@atlas/toolkit";
import { REPLICA_IDS } from "./replicas";

export const policyExamples = {
  counter: {
    title: "A total is not an increment",
    input: "Start at 0. Alice adds 7 while Bob adds 3, before either sees the other's note.",
    left: "LWW map of whole totals",
    right: "G-counter components",
    lesson: "The map selects one total. The G-counter preserves both increments and reaches 10.",
    actions: ["Make both increments", "Deliver both notes", "Repeat Bob's counter note"],
  },
  register: {
    title: "One answer or both reports?",
    input: "Start with no report. Alice writes Trail open while Bob writes Trail closed.",
    left: "LWWRegister",
    right: "MvRegister",
    lesson: "Selecting one answer and retaining concurrent alternatives are different policies, not different levels of correctness.",
    actions: ["Write both reports", "Deliver both reports"],
  },
  readd: {
    title: "Add again after everybody saw the removal",
    input: "All three hikers know Eagle Creek. Alice removes it; only after that removal reaches everyone does Bob add it again.",
    left: "TwoPSet",
    right: "Observed-remove set",
    lesson: "TwoPSet permanently retires the name. An observed-remove set permits a fresh addition after removal.",
    actions: ["Remove and share Eagle Creek", "Add a fresh Eagle Creek and share"],
  },
  replay: {
    title: "An old note is not a fresh addition",
    input: "Save Alice's original Eagle Creek addition. Remove that observed addition everywhere, then replay exactly the saved note.",
    left: "Toy model: discard removal evidence",
    right: "Observed-remove set",
    lesson: "The membership-only toy resurrects the old beacon. Retained causal context keeps the original addition removed.",
    actions: ["Remove the observed addition", "Replay the saved addition"],
  },
} as const;

export type PolicyKind = keyof typeof policyExamples;
export type PolicyFrame = {
  left: string[][];
  right: string[][];
  leftEvidence: string;
  rightEvidence: string;
};

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
  return result.value;
}

function mergeRegister(state: MvRegister, operation: Operation): MvRegister {
  const merged = value(merge(state, operation));
  if (merged.kind !== "mv-register") throw new Error("Expected an MV-register merge");
  return merged;
}

function mergeSet(state: OrSet, operation: Operation): OrSet {
  const merged = value(merge(state, operation));
  if (merged.kind !== "or-set") throw new Error("Expected an OR-set merge");
  return merged;
}

export function policyKind(input: string | undefined): PolicyKind {
  if (input === "counter" || input === "register" || input === "readd" || input === "replay") return input;
  throw new Error("Unknown policy comparison");
}

function counterFrame(step: number): PolicyFrame {
  const map = value(createMapRoom("lww-map")).room;
  value(updateMapRoom(map, "A", "set", "bird-count", "0"));
  let mapView = value(deliverMapOperations(map)).view;
  let counters = REPLICA_IDS.map((id) => value(createGCounter(id)));
  if (step > 0) {
    value(updateMapRoom(map, "A", "set", "bird-count", "7"));
    mapView = value(updateMapRoom(map, "B", "set", "bird-count", "3")).view;
    const alice = value(incrementGCounter(counters[0], 7));
    const bob = value(incrementGCounter(counters[1], 3));
    counters = [alice.state, bob.state, counters[2]!];
    if (step > 1) {
      mapView = value(deliverMapOperations(map)).view;
      counters = counters.map((state) => value(mergeGCounter(
        value(mergeGCounter(state, alice.operation)), bob.operation,
      )));
      if (step > 2) counters = counters.map((state) => value(mergeGCounter(state, bob.operation)));
    }
  }
  const total = (state: GCounter) => [String(state.value)];
  return {
    left: mapView.replicas.map(({ entries }) => {
      const entry = entries.find(({ key }) => key === "bird-count");
      if (!entry) throw new Error("Missing bird-count map entry");
      return [entry.value];
    }),
    right: counters.map(total),
    leftEvidence: `The same bird-count key stores whole totals. Delivered sequence: ${mapView.sequenceNumber}.`,
    rightEvidence: `Per-writer components: ${JSON.stringify(counters.map(({ counts }) => counts))}`,
  };
}

function registerFrame(step: number): PolicyFrame {
  const lww = value(createRegisterDemoRoom("lww-register"));
  let view = lww.view;
  const initial = REPLICA_IDS.map((id) => value(createMvRegister(id)));
  let registers = initial;
  if (step > 0) {
    view = value(stageRegisterDemoRace(lww.room)).view;
    const alice = value(write(initial[0], "Trail open"));
    const bob = value(write(initial[1], "Trail closed"));
    registers = [alice.state, bob.state, initial[2]!];
    if (step > 1) {
      view = value(deliverRegisterDemo(lww.room)).view;
      registers = registers.map((state) => mergeRegister(mergeRegister(state, alice.operation), bob.operation));
    }
  }
  return {
    left: view.replicas.map(({ values }) => values),
    right: registers.map(({ entries }) => entries.map(({ value }) => value).sort()),
    leftEvidence: `Winning timestamp: ${view.timestamp}; writer: ${view.winnerAuthor || "none"}.`,
    rightEvidence: `Current write identities: ${JSON.stringify(registers.map(({ entries }) => entries.map(({ tag }) => tag)))}`,
  };
}

function readdFrame(step: number): PolicyFrame {
  const left = value(createSetRoom("two-p-set"));
  const right = value(createSetRoom("or-set"));
  let leftView = left.view;
  let rightView = right.view;
  if (step > 0) {
    value(updateSetRoom(left.room, "A", "remove", "Eagle Creek"));
    value(updateSetRoom(right.room, "A", "remove", "Eagle Creek"));
    leftView = value(deliverSetOperations(left.room)).view;
    rightView = value(deliverSetOperations(right.room)).view;
  }
  if (step > 1) {
    value(updateSetRoom(left.room, "B", "add", "Eagle Creek"));
    value(updateSetRoom(right.room, "B", "add", "Eagle Creek"));
    leftView = value(deliverSetOperations(left.room)).view;
    rightView = value(deliverSetOperations(right.room)).view;
  }
  return {
    left: leftView.replicas.map(({ values }) => values),
    right: rightView.replicas.map(({ values }) => values),
    leftEvidence: `Addition and permanent-removal sets; delivered sequence ${leftView.sequenceNumber}.`,
    rightEvidence: `Bob's new add follows delivery of Alice's removal; delivered sequence ${rightView.sequenceNumber}.`,
  };
}

function replayFrame(step: number): PolicyFrame {
  const original = value(add(value(createOrSet("A")), "Eagle Creek"));
  let sets: OrSet[] = REPLICA_IDS.map((id) =>
    mergeSet(value(createOrSet(id)), original.operation));
  const toys = sets.map(({ entries }) => new Set(entries.map(({ value }) => value)));
  if (step > 0) {
    const removal = value(remove(sets[0], "Eagle Creek"));
    sets = sets.map((state) => mergeSet(state, removal.operation));
    for (const toy of toys) toy.delete("Eagle Creek");
  }
  if (step > 1) {
    sets = sets.map((state) => mergeSet(state, original.operation));
    for (const toy of toys) {
      for (const entry of original.operation.delta.entries) toy.add(entry.value);
    }
  }
  return {
    left: toys.map((set) => [...set]),
    right: sets.map(({ entries }) => entries.filter(({ tags }) => tags.length).map(({ value }) => value)),
    leftEvidence: "Intentional toy: remember only current membership; a delayed add is accepted again.",
    rightEvidence: `Saved operation tags: ${JSON.stringify(original.operation.delta.entries)}; retained removals: ${JSON.stringify(sets.map(({ tombstones }) => tombstones))}`,
  };
}

export function policyFrame(kind: PolicyKind, step: number): PolicyFrame {
  if (!Number.isInteger(step) || step < 0 || step > policyExamples[kind].actions.length) {
    throw new Error("Invalid policy comparison step");
  }
  switch (kind) {
    case "counter": return counterFrame(step);
    case "register": return registerFrame(step);
    case "readd": return readdFrame(step);
    case "replay": return replayFrame(step);
  }
}
