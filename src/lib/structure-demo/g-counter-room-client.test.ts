import { describe, expect, test } from "vitest";
import {
  isRoomMessage,
  normalizeRoomCode,
  roomWebSocketUrl,
} from "./g-counter-room-client";

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
      events: [],
      connected: 3,
    })).toBe(true);
  });
});
