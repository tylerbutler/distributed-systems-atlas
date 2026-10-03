import type { ReplicaId } from "./g-counter";

export type RoomIncrement = {
  readonly id: string;
  readonly sequence: number;
  readonly replica: ReplicaId;
  readonly amount: 1 | 3 | 7;
};

type RoomHello = {
  readonly type: "hello";
  readonly room: string;
  readonly replica: ReplicaId | null;
  readonly events: readonly RoomIncrement[];
  readonly connected: number;
};

type RoomMessage =
  | RoomHello
  | { readonly type: "increment"; readonly event: RoomIncrement }
  | { readonly type: "reset" }
  | { readonly type: "presence"; readonly connected: number }
  | { readonly type: "error"; readonly message: string };

function isReplica(value: unknown): value is ReplicaId {
  return value === "A" || value === "B" || value === "C";
}

function isIncrement(value: unknown): value is RoomIncrement {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  return typeof event.id === "string"
    && typeof event.sequence === "number"
    && isReplica(event.replica)
    && (event.amount === 1 || event.amount === 3 || event.amount === 7);
}

export function isRoomMessage(value: unknown): value is RoomMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "reset") return true;
  if (message.type === "increment") return isIncrement(message.event);
  if (message.type === "presence") return typeof message.connected === "number";
  if (message.type === "error") return typeof message.message === "string";
  return message.type === "hello"
    && typeof message.room === "string"
    && (message.replica === null || isReplica(message.replica))
    && Array.isArray(message.events)
    && message.events.every(isIncrement)
    && typeof message.connected === "number";
}

export type GCounterRoomHandlers = {
  hello(message: RoomHello): void;
  increment(event: RoomIncrement): void;
  reset(): void;
  presence(connected: number): void;
  status(message: string): void;
  closed(): void;
};

export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function roomWebSocketUrl(origin: string, room: string): string {
  const url = new URL(`/rooms/${normalizeRoomCode(room)}`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class GCounterRoomClient {
  private socket?: WebSocket;

  constructor(
    private readonly origin: string,
    private readonly handlers: GCounterRoomHandlers,
  ) {}

  connect(room: string): void {
    this.close();
    const socket = new WebSocket(roomWebSocketUrl(this.origin, room));
    this.socket = socket;
    socket.addEventListener("message", (event) => this.receive(String(event.data)));
    socket.addEventListener("error", () => {
      this.handlers.status("Could not connect to the live room.");
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = undefined;
        this.handlers.closed();
      }
    });
  }

  increment(amount: number): void {
    if (amount !== 1 && amount !== 3 && amount !== 7) {
      throw new Error(`Unsupported G-counter increment: ${amount}`);
    }
    this.send({ type: "increment", id: crypto.randomUUID(), amount });
  }

  reset(): void {
    this.send({ type: "reset" });
  }

  close(): void {
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, "left room");
  }

  private send(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("The live room is not connected.");
    }
    this.socket.send(JSON.stringify(message));
  }

  private receive(raw: string): void {
    let message: unknown;
    try {
      message = JSON.parse(raw);
    } catch {
      this.handlers.status("The live room sent an invalid message.");
      return;
    }
    if (!isRoomMessage(message)) {
      this.handlers.status("The live room sent an invalid message.");
      return;
    }
    if (message.type === "hello") this.handlers.hello(message);
    else if (message.type === "increment") this.handlers.increment(message.event);
    else if (message.type === "reset") this.handlers.reset();
    else if (message.type === "presence") this.handlers.presence(message.connected);
    else if (message.type === "error") this.handlers.status(message.message);
  }
}
