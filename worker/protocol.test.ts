import { describe, expect, test } from "vitest";
import { isRoomState, MAX_COMPONENT, parseClientMessage, ROOM_CODE } from "./protocol";

const epoch = "9df10f6c-c764-46d8-a3c8-54eec6227005";

describe("G-counter room protocol", () => {
  test("accepts cumulative component state and epoch-scoped reset", () => {
    expect(parseClientMessage(JSON.stringify({
      type: "state", epoch, count: 10,
    }))).toEqual({ type: "state", epoch, count: 10 });
    expect(parseClientMessage(JSON.stringify({ type: "reset", epoch })))
      .toEqual({ type: "reset", epoch });
  });

  test("rejects malformed room input", () => {
    expect(parseClientMessage('{"type":"increment","id":"short","amount":2}')).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(0))).toBeNull();
    expect(ROOM_CODE.test("EAGLE7")).toBe(true);
    expect(ROOM_CODE.test("../room")).toBe(false);
    expect(parseClientMessage('{"type":"reset"}')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: "state", epoch: "old", count: 7 }))).toBeNull();
    for (const count of [-1, 0.5, MAX_COMPONENT + 1, "7", null]) {
      expect(parseClientMessage(JSON.stringify({ type: "state", epoch, count }))).toBeNull();
    }
    expect(parseClientMessage(" ".repeat(257))).toBeNull();
  });

  test("bounds complete snapshots so their totals remain safe integers", () => {
    expect(isRoomState({ epoch, counts: { A: MAX_COMPONENT, B: MAX_COMPONENT, C: MAX_COMPONENT } }))
      .toBe(true);
    expect(Number.isSafeInteger(MAX_COMPONENT * 3)).toBe(true);
    expect(isRoomState({ epoch, counts: { A: 7, B: 3 } })).toBe(false);
    expect(isRoomState({ epoch, counts: { A: Infinity, B: 0, C: 0 } })).toBe(false);
  });
});
