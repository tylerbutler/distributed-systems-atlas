import { describe, expect, test } from "vitest";
import { parseClientMessage, ROOM_CODE } from "./protocol";

describe("G-counter room protocol", () => {
  test("accepts supported increments and reset", () => {
    expect(parseClientMessage(JSON.stringify({
      type: "increment",
      id: "9df10f6c-c764-46d8-a3c8-54eec6227005",
      amount: 3,
    }))).toEqual({
      type: "increment",
      id: "9df10f6c-c764-46d8-a3c8-54eec6227005",
      amount: 3,
    });
    expect(parseClientMessage('{"type":"reset"}')).toEqual({ type: "reset" });
  });

  test("rejects malformed room input", () => {
    expect(parseClientMessage('{"type":"increment","id":"short","amount":2}')).toBeNull();
    expect(parseClientMessage(new ArrayBuffer(0))).toBeNull();
    expect(ROOM_CODE.test("EAGLE7")).toBe(true);
    expect(ROOM_CODE.test("../room")).toBe(false);
  });
});
