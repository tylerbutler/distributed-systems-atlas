import type { ReplicaId } from "./g-counter";
import { isCount, isEpoch, isRoomState, ROOM_CODE, type RoomState } from "../../../worker/protocol";
export type { RoomCounts, RoomState } from "../../../worker/protocol";

type RoomHello = {
  readonly type: "hello";
  readonly room: string;
  readonly replica: ReplicaId | null;
  readonly state: RoomState;
  readonly connected: number;
};

type RoomMessage =
  | RoomHello
  | { readonly type: "state"; readonly state: RoomState }
  | { readonly type: "reset"; readonly state: RoomState }
  | { readonly type: "presence"; readonly connected: number }
  | { readonly type: "error"; readonly message: string; readonly state: RoomState };

function isReplica(value: unknown): value is ReplicaId {
  return value === "A" || value === "B" || value === "C";
}

function isConnectedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

export function isRoomMessage(value: unknown): value is RoomMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "reset" || message.type === "state") return isRoomState(message.state);
  if (message.type === "presence") return isConnectedCount(message.connected);
  if (message.type === "error") return typeof message.message === "string" && isRoomState(message.state);
  return message.type === "hello"
    && typeof message.room === "string" && ROOM_CODE.test(message.room)
    && (message.replica === null || isReplica(message.replica))
    && isRoomState(message.state)
    && isConnectedCount(message.connected);
}

export type GCounterRoomHandlers = {
  hello(message: RoomHello): void;
  state(state: RoomState): void;
  reset(state: RoomState): void;
  rejected(message: string, state: RoomState): void;
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
    socket.addEventListener("message", (event) => {
      if (this.socket === socket) this.receive(String(event.data));
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket) this.handlers.status("Could not connect to the live room.");
    });
    socket.addEventListener("close", () => {
      if (this.socket === socket) {
        this.socket = undefined;
        this.handlers.closed();
      }
    });
  }

  publish(count: number, epoch: string): void {
    if (!isCount(count) || !isEpoch(epoch)) throw new Error("Invalid G-counter room state.");
    this.send({ type: "state", epoch, count });
  }

  reset(epoch: string): void {
    if (!isEpoch(epoch)) throw new Error("Invalid G-counter reset epoch.");
    this.send({ type: "reset", epoch });
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
    else if (message.type === "state") this.handlers.state(message.state);
    else if (message.type === "reset") this.handlers.reset(message.state);
    else if (message.type === "presence") this.handlers.presence(message.connected);
    else if (message.type === "error") this.handlers.rejected(message.message, message.state);
  }
}
