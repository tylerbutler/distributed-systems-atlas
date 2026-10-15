import type { ComparisonPhase, TrailRecord } from "@atlas/toolkit";

export const moveInitialRecords: TrailRecord[] = [
  { id: "bridge", value: "open" },
  { id: "weir", value: "open" },
  { id: "north-gate", value: "open" },
];

export const moveToyInputs = {
  move: { from: 1, to: 0 },
  edit: { index: 1, intendedId: "weir", value: "blocked" },
} as const;

type ToyOperation = typeof moveToyInputs.move | typeof moveToyInputs.edit;

function apply(records: TrailRecord[], operation: ToyOperation): TrailRecord[] {
  const next = records.map((record) => ({ ...record }));
  if ("from" in operation) {
    const [record] = next.splice(operation.from, 1);
    next.splice(operation.to, 0, record);
  } else {
    next[operation.index].value = operation.value;
  }
  return next;
}

export function moveToyClients(phase: ComparisonPhase, reverse = false) {
  const { move, edit } = moveToyInputs;
  const start = () => moveInitialRecords.map((record) => ({ ...record }));
  const alice = phase === "ready" ? start() : apply(start(), move);
  const bob = phase === "ready" ? start() : apply(start(), edit);
  const carolOperations = reverse ? [edit, move] : [move, edit];
  return [
    { id: "A", records: phase === "delivered" ? apply(alice, edit) : alice },
    { id: "B", records: phase === "delivered" ? apply(bob, move) : bob },
    { id: "C", records: phase === "delivered"
      ? carolOperations.reduce(apply, start())
      : start() },
  ];
}
