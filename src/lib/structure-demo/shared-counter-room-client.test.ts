import { afterEach, describe, expect, test, vi } from "vitest";
import { SharedCounterRoomClient, isSharedCounterRoomMessage } from "./shared-counter-room-client";
import {
  MAX_SHARED_AMOUNT, parseSharedCounterMessage, type SequencedCounterOperation,
} from "../../../worker/shared-counter-protocol";

const epoch = "9df10f6c-c764-46d8-a3c8-54eec6227005";
const nextEpoch = "349ba5f0-6e57-4a9f-bb4c-f4f2712c1c30";
const operation = (sequenceNumber: number): SequencedCounterOperation => ({
  id: crypto.randomUUID(), sequenceNumber, author: "A", amount: 3,
});

class FakeSocket extends EventTarget {
  static OPEN = 1;
  static latest: FakeSocket;
  readyState = 1;
  sent: unknown[] = [];
  constructor(readonly url: string) {
    super();
    FakeSocket.latest = this;
  }
  send(message: string): void { this.sent.push(JSON.parse(message)); }
  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
  receive(message: unknown): void {
    this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) }));
  }
}

afterEach(() => vi.unstubAllGlobals());

function room() {
  vi.stubGlobal("WebSocket", FakeSocket);
  const handlers = {
    hello: vi.fn(), operation: vi.fn(), reset: vi.fn(), rejected: vi.fn(),
    presence: vi.fn(), status: vi.fn(), closed: vi.fn(),
  };
  const client = new SharedCounterRoomClient("https://rooms.example.com", handlers);
  client.connect("eagle7");
  const socket = FakeSocket.latest;
  socket.receive({ type: "hello", room: "EAGLE7", replica: "A", connected: 3, epoch, operations: [] });
  return { client, socket, handlers };
}

describe("SharedCounter real-room protocol", () => {
  test("accepts only bounded signed operations, reset epochs, and valid recovery cursors", () => {
    const input = { type: "increment", epoch, id: crypto.randomUUID(), amount: -3 };
    expect(parseSharedCounterMessage(JSON.stringify(input))).toEqual(input);
    for (const amount of [0, 1.5, MAX_SHARED_AMOUNT + 1, -(MAX_SHARED_AMOUNT + 1)]) {
      expect(parseSharedCounterMessage(JSON.stringify({ ...input, amount }))).toBeNull();
    }
    expect(parseSharedCounterMessage(JSON.stringify({ type: "history", epoch, after: 1000 })))
      .toEqual({ type: "history", epoch, after: 1000 });
    expect(parseSharedCounterMessage(JSON.stringify({ type: "history", epoch, after: 1001 }))).toBeNull();
    expect(parseSharedCounterMessage("not JSON")).toBeNull();
    expect(isSharedCounterRoomMessage({ type: "operation", epoch, operation: operation(0) })).toBe(false);
  });

  test("buffers gaps, requests actual server history, and drops exact duplicates", () => {
    const { socket, handlers } = room();
    expect(socket.url).toBe("wss://rooms.example.com/rooms/shared-counter/EAGLE7");
    const first = operation(1);
    const second = operation(2);
    socket.receive({ type: "operation", epoch, operation: second });
    expect(handlers.operation).not.toHaveBeenCalled();
    expect(socket.sent).toEqual([{ type: "history", epoch, after: 0 }]);
    socket.receive({ type: "operation", epoch, operation: second });
    expect(socket.sent).toHaveLength(1);
    socket.receive({ type: "history", epoch, operations: [first, second] });
    expect(handlers.operation.mock.calls.map(([value]) => value)).toEqual([first, second]);
    socket.receive({ type: "operation", epoch, operation: second });
    expect(handlers.operation).toHaveBeenCalledTimes(2);
    expect(handlers.closed).not.toHaveBeenCalled();
  });

  test("sends only signed operation data and changes epochs on reset", () => {
    const { client, socket, handlers } = room();
    const id = crypto.randomUUID();
    client.submit(id, -3);
    expect(socket.sent).toEqual([{ type: "increment", epoch, id, amount: -3 }]);
    socket.receive({ type: "reset", epoch: nextEpoch, operations: [] });
    socket.receive({ type: "operation", epoch, operation: operation(1) });
    expect(handlers.operation).not.toHaveBeenCalled();
    client.reset();
    expect(socket.sent.at(-1)).toEqual({ type: "reset", epoch: nextEpoch });
    const old = socket;
    client.connect("EAGLE8");
    old.receive({ type: "reset", epoch, operations: [] });
    expect(handlers.reset).toHaveBeenCalledTimes(1);
  });

  test("closes on conflicting duplicates, invalid recovery, or a kernel callback failure", () => {
    const { socket, handlers } = room();
    const first = operation(1);
    socket.receive({ type: "operation", epoch, operation: first });
    socket.receive({ type: "operation", epoch, operation: { ...first, amount: -1 } });
    expect(socket.readyState).toBe(3);
    expect(handlers.status).toHaveBeenLastCalledWith(expect.stringContaining("reused a sequence number"));
    const broken = room();
    broken.handlers.operation.mockImplementation(() => { throw new Error("native kernel refused acknowledgement"); });
    broken.socket.receive({ type: "operation", epoch, operation: first });
    expect(broken.socket.readyState).toBe(3);
    expect(broken.handlers.status).toHaveBeenLastCalledWith("native kernel refused acknowledgement");
    const missing = room();
    missing.socket.receive({ type: "operation", epoch, operation: operation(2) });
    missing.socket.receive({ type: "history", epoch, operations: [] });
    expect(missing.socket.readyState).toBe(3);
    expect(missing.handlers.status).toHaveBeenLastCalledWith(expect.stringContaining("missing operations"));
  });
});
