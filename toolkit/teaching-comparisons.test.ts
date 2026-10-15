import { describe, expect, it } from "vitest";
import {
  createMoveComparison, stageMoveComparison, deliverMoveComparison,
  createTextComparison, stageTextComparison, deliverTextComparison,
  type ComparisonResult, type MoveComparisonHandle, type TextComparisonHandle,
} from "./teaching-comparisons.mjs";
import {
  moveInitialRecords, moveToyClients, moveToyInputs,
} from "../src/lib/structure-demo/sequence-move-comparison";

function value<T>(result: ComparisonResult<T>): T {
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

const initial = "The weir is clear.";
const finalRecords = [
  { id: "weir", value: "blocked" },
  { id: "bridge", value: "open" },
  { id: "north-gate", value: "open" },
];

describe("SequenceCrdt IDs + native LWW-map fields", () => {
  for (const reverse of [false, true]) {
    it(`keeps Bob's record target and order when reverse=${reverse}`, () => {
      const created = value(createMoveComparison());
      expect(created.view.clients.map((client) => client.records)).toEqual(Array(3).fill(moveInitialRecords));
      expect(deliverMoveComparison(created.room, reverse)).toMatchObject({ ok: false, error: { tag: "invalid-state" } });
      const staged = value(stageMoveComparison(created.room));
      expect(staged.view.phase).toBe("staged");
      expect(staged.view.clients[0].records.map((record) => record.id)).toEqual(["weir", "bridge", "north-gate"]);
      expect(staged.view.clients[1].records).toEqual(moveInitialRecords.map((record) => record.id === "weir" ? { ...record, value: "blocked" } : record));
      expect(staged.view.clients[2].records).toEqual(moveInitialRecords);
      const delivered = value(deliverMoveComparison(created.room, reverse));
      expect(delivered.view.clients.map((client) => client.records)).toEqual(Array(3).fill(finalRecords));
      expect(delivered.view.phase).toBe("delivered");
      expect(stageMoveComparison(created.room)).toMatchObject({ ok: false });
      const reset = value(createMoveComparison());
      expect(reset.view).toEqual(created.view);
    });
  }

  it("shows the same native Weir item identity before and after p2p_move", () => {
    const created = value(createMoveComparison());
    const staged = value(stageMoveComparison(created.room));
    const summary = (line: string) => JSON.parse(line.slice(line.indexOf("{")));
    const before = summary(created.view.evidence[0]).state.segments;
    const after = summary(staged.view.evidence.find((line) => line.startsWith("SequenceCrdt summary after move"))!).state.segments;
    expect(after.map((item: { id: unknown }) => item.id)).toEqual(before.map((item: { id: unknown }) => item.id));
    expect(after.find((item: { value: string }) => item.value === "weir")).toMatchObject({
      id: { replica_id: "A", counter: 2 }, deleted: null,
      move: { op_id: { replica_id: "A", counter: 4 } },
    });
    expect(staged.view.evidence.join("\n")).toContain('Set(key: "weir", value: "blocked"');
  });

  it("computes the deliberately stale-index toy from its actual operations", () => {
    expect(moveToyInputs.edit).toEqual({ index: 1, intendedId: "weir", value: "blocked" });
    expect(moveToyClients("ready").map((client) => client.records)).toEqual(Array(3).fill(moveInitialRecords));
    for (const reverse of [false, true]) {
      const clients = moveToyClients("delivered", reverse);
      expect(clients[0].records).toEqual([
        { id: "weir", value: "open" }, { id: "bridge", value: "blocked" },
        { id: "north-gate", value: "open" },
      ]);
      expect(clients[1].records).toEqual(finalRecords);
      expect(clients[2].records).toEqual(clients[reverse ? 1 : 0].records);
    }
  });
});

describe("matched native TextCrdt and RichTextOt inputs", () => {
  for (const reverse of [false, true]) {
    it(`derives exact converged native text when reverse=${reverse}`, () => {
      const created = value(createTextComparison());
      expect(created.view.clients).toEqual(["A", "B", "C"].map((id) => ({ id, crdt: initial, ot: initial })));
      expect(deliverTextComparison(created.room)).toMatchObject({ ok: false, error: { tag: "invalid-state" } });
      const staged = value(stageTextComparison(created.room));
      const authored = ["The still weir is clear.", "The calm weir is clear.", initial];
      expect(staged.view.clients.map((client) => client.crdt)).toEqual(authored);
      expect(staged.view.clients.map((client) => client.ot)).toEqual(authored);
      expect(staged.view.evidence.join("\n")).toContain('Insert(index: 4, value: "still "');
      expect(staged.view.evidence.join("\n")).toContain('Insert(index: 4, value: "calm "');
      expect(staged.view.evidence.filter((line) => line.includes("RichTextOt reference=0"))).toEqual([
        'A RichTextOt reference=0 delta=[{"retain":4},{"insert":"still "}]',
        'B RichTextOt reference=0 delta=[{"retain":4},{"insert":"calm "}]',
      ]);
      const delivered = value(deliverTextComparison(created.room, reverse));
      expect(delivered.view.clients.map((client) => client.crdt)).toEqual(Array(3).fill("The still calm weir is clear."));
      expect(delivered.view.clients.map((client) => client.ot)).toEqual(Array(3).fill(reverse ? "The calm still weir is clear." : "The still calm weir is clear."));
      expect(delivered.view.evidence.at(-1)).toBe(reverse
        ? 'A transformed against #1 at head reference 1: [{"retain":9},{"insert":"still "}]'
        : 'B transformed against #1 at head reference 1: [{"retain":10},{"insert":"calm "}]');
      expect(value(createTextComparison()).view).toEqual(created.view);
    });
  }
});

it("rejects forged and cross-model handles, validates order, and retains valid state after failure", () => {
  expect(stageMoveComparison({} as MoveComparisonHandle)).toMatchObject({ ok: false, error: { tag: "invalid-handle" } });
  const move = value(createMoveComparison());
  expect(stageTextComparison(move.room as unknown as TextComparisonHandle)).toMatchObject({ ok: false, error: { tag: "invalid-handle" } });
  value(stageMoveComparison(move.room));
  expect(stageMoveComparison(move.room)).toMatchObject({ ok: false, error: { tag: "invalid-state" } });
  expect(deliverMoveComparison(move.room, "reverse" as unknown as boolean)).toMatchObject({ ok: false, error: { tag: "invalid-input" } });
  expect(value(deliverMoveComparison(move.room)).view.clients[0].records).toEqual(finalRecords);
  const text = value(createTextComparison());
  value(stageTextComparison(text.room));
  expect(stageTextComparison(text.room)).toMatchObject({ ok: false });
  expect(deliverTextComparison(text.room, null as unknown as boolean)).toMatchObject({ ok: false, error: { tag: "invalid-input" } });
  expect(value(deliverTextComparison(text.room)).view.clients[0].crdt).toBe("The still calm weir is clear.");
});
