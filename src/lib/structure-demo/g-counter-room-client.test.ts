import { describe, expect, test } from "vitest";
import {
  isRoomMessage,
  normalizeRoomCode,
  roomWebSocketUrl,
} from "./g-counter-room-client";

const state = {
  epoch: "9df10f6c-c764-46d8-a3c8-54eec6227005",
  counts: { A: 7, B: 3, C: 0 },
};

describe("G-counter room client", () => {
  test("normalizes share codes", () => {
    expect(normalizeRoomCode(" eagle-7! ")).toBe("EAGLE7");
    expect(normalizeRoomCode("abcdefghijkl")).toBe("ABCDEFGH");
  });

  test("uses secure WebSockets with an HTTPS room service", () => {
    expect(roomWebSocketUrl("https://rooms.example.com", "eagle7"))
      .toBe("wss://rooms.example.com/rooms/EAGLE7");
  });

  test("rejects malformed server messages", () => {
    expect(isRoomMessage({ type: "increment", event: null })).toBe(false);
    expect(isRoomMessage({
      type: "hello",
      room: "EAGLE7",
      replica: "A",
      state,
      connected: 3,
    })).toBe(true);
    expect(isRoomMessage({ type: "state", state })).toBe(true);
    expect(isRoomMessage({ type: "reset", state })).toBe(true);
    expect(isRoomMessage({ type: "error", state, message: "The room was reset." })).toBe(true);
    expect(isRoomMessage({ type: "reset" })).toBe(false);
    expect(isRoomMessage({ type: "state", state: { ...state, counts: { A: -1, B: 3, C: 0 } } }))
      .toBe(false);
    expect(isRoomMessage({ type: "presence", connected: -1 })).toBe(false);
    expect(isRoomMessage({ type: "presence", connected: 2, replicas: ["A", "C"] })).toBe(true);
    expect(isRoomMessage({ type: "presence", connected: 2, replicas: ["A", "A"] })).toBe(false);
  });
});
