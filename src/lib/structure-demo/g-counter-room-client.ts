import type { ReplicaId } from "./g-counter";
import { isCount, isEpoch, isRoomPresence, isRoomState, ROOM_CODE, type RoomPresence, type RoomState } from "../../../worker/protocol";
import { RoomSocket } from "./room-socket";
export { normalizeRoomCode, roomWebSocketUrl } from "./room-socket";
export type { RoomCounts, RoomState } from "../../../worker/protocol";

type RoomHello = RoomPresence & {
  readonly type: "hello";
  readonly room: string;
  readonly replica: ReplicaId | null;
  readonly state: RoomState;
};

type RoomMessage =
  | RoomHello
  | { readonly type: "state"; readonly state: RoomState }
  | { readonly type: "reset"; readonly state: RoomState }
  | (RoomPresence & { readonly type: "presence" })
  | { readonly type: "error"; readonly message: string; readonly state: RoomState };

function isReplica(value: unknown): value is ReplicaId {
  return value === "A" || value === "B" || value === "C";
}

export function isRoomMessage(value: unknown): value is RoomMessage {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "reset" || message.type === "state") return isRoomState(message.state);
  if (message.type === "presence") return isRoomPresence(message);
  if (message.type === "error") return typeof message.message === "string" && isRoomState(message.state);
  return message.type === "hello"
    && typeof message.room === "string" && ROOM_CODE.test(message.room)
    && (message.replica === null || isReplica(message.replica))
    && isRoomState(message.state)
    && isRoomPresence(message);
}

export type GCounterRoomHandlers = {
  hello(message: RoomHello): void;
  state(state: RoomState): void;
  reset(state: RoomState): void;
  rejected(message: string, state: RoomState): void;
  presence(connected: number, replicas?: readonly ReplicaId[]): void;
  status(message: string): void;
  closed(): void;
};

export class GCounterRoomClient {
  private readonly socket: RoomSocket;

  constructor(
    origin: string,
    private readonly handlers: GCounterRoomHandlers,
  ) {
    this.socket = new RoomSocket(origin, {
      message: (message) => this.receive(message),
      status: (message) => handlers.status(message),
      closed: () => handlers.closed(),
    });
  }

  connect(room: string): void {
    this.socket.connect(room);
  }

  publish(count: number, epoch: string): void {
    if (!isCount(count) || !isEpoch(epoch)) throw new Error("Invalid G-counter room state.");
    this.socket.send({ type: "state", epoch, count });
  }

  reset(epoch: string): void {
    if (!isEpoch(epoch)) throw new Error("Invalid G-counter reset epoch.");
    this.socket.send({ type: "reset", epoch });
  }

  close(): void {
    this.socket.close();
  }

  private receive(message: unknown): void {
    if (!isRoomMessage(message)) {
      this.handlers.status("The live room sent an invalid message.");
      return;
    }
    if (message.type === "hello") this.handlers.hello(message);
    else if (message.type === "state") this.handlers.state(message.state);
    else if (message.type === "reset") this.handlers.reset(message.state);
    else if (message.type === "presence") this.handlers.presence(message.connected, message.replicas);
    else if (message.type === "error") this.handlers.rejected(message.message, message.state);
  }
}
