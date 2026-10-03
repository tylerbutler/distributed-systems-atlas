import { isEpoch, isRoomPresence, ROOM_CODE, type RoomPresence, type RoomReplica } from "../../../worker/protocol";
import {
  isSequencedCounterOperation,
  isSharedAmount,
  isSharedCounterHistory,
  type SequencedCounterOperation,
  type SharedCounterHistory,
} from "../../../worker/shared-counter-protocol";
import { RoomSocket } from "./room-socket";

type Hello = SharedCounterHistory & RoomPresence & {
  readonly type: "hello"; readonly room: string;
  readonly replica: RoomReplica | null;
};
type Message =
  | Hello
  | (SharedCounterHistory & { readonly type: "history" })
  | (SharedCounterHistory & { readonly type: "reset" })
  | (SharedCounterHistory & { readonly type: "error"; readonly message: string })
  | { readonly type: "operation"; readonly epoch: string; readonly operation: SequencedCounterOperation }
  | (RoomPresence & { readonly type: "presence" });
export type SharedCounterRoomHandlers = {
  hello(message: Hello): void;
  operation(operation: SequencedCounterOperation): void;
  reset(history: SharedCounterHistory): void;
  rejected(message: string, history: SharedCounterHistory): void;
  presence(connected: number, replicas?: readonly RoomReplica[]): void;
  status(message: string): void;
  closed(): void;
};

export function isSharedCounterRoomMessage(value: unknown): value is Message {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  if (message.type === "presence") return isRoomPresence(message);
  if (message.type === "operation") {
    return isEpoch(message.epoch) && isSequencedCounterOperation(message.operation);
  }
  if (!isSharedCounterHistory(value)) return false;
  if (message.type === "history") return true;
  if (message.type === "reset") return value.operations.length === 0;
  if (message.type === "error") return typeof message.message === "string";
  return message.type === "hello"
    && typeof message.room === "string" && ROOM_CODE.test(message.room)
    && (message.replica === null || message.replica === "A" || message.replica === "B" || message.replica === "C")
    && isRoomPresence(message);
}

export class SharedCounterRoomClient {
  private readonly socket: RoomSocket;
  private epoch = "";
  private cursor = 0;
  private operations = new Map<number, SequencedCounterOperation>();
  private ids = new Map<string, number>();
  private requestingHistory = false;

  constructor(origin: string, private readonly handlers: SharedCounterRoomHandlers) {
    this.socket = new RoomSocket(origin, {
      message: (message) => this.receive(message),
      status: (message) => this.fail(message),
      closed: () => handlers.closed(),
    }, "/rooms/shared-counter/");
  }

  connect(room: string): void {
    this.socket.connect(room);
  }

  submit(id: string, amount: number): void {
    if (!isEpoch(id) || !isEpoch(this.epoch) || !isSharedAmount(amount)) {
      throw new Error("Invalid SharedCounter signed operation.");
    }
    this.socket.send({ type: "increment", epoch: this.epoch, id, amount });
  }

  reset(): void {
    if (!isEpoch(this.epoch)) throw new Error("The room has not supplied a reset epoch.");
    this.socket.send({ type: "reset", epoch: this.epoch });
  }

  close(): void {
    this.socket.close();
  }

  private adopt(history: SharedCounterHistory): void {
    const ids = new Set(history.operations.map(({ id }) => id));
    if (ids.size !== history.operations.length
      || history.operations.some((operation, index) => operation.sequenceNumber !== index + 1)) {
      throw new Error("The room's stored operation log is not a consecutive, unique prefix.");
    }
    this.epoch = history.epoch;
    this.cursor = history.operations.length;
    this.operations = new Map(history.operations.map((operation) => [operation.sequenceNumber, operation]));
    this.ids = new Map(history.operations.map(({ id, sequenceNumber }) => [id, sequenceNumber]));
    this.requestingHistory = false;
  }

  private record(operation: SequencedCounterOperation): void {
    const existing = this.operations.get(operation.sequenceNumber);
    if (existing) {
      if (existing.id !== operation.id || existing.author !== operation.author || existing.amount !== operation.amount) {
        throw new Error("The room reused a sequence number for a different operation.");
      }
      return;
    }
    if (this.ids.has(operation.id)) throw new Error("The room assigned an action ID two sequence numbers.");
    this.operations.set(operation.sequenceNumber, operation);
    this.ids.set(operation.id, operation.sequenceNumber);
  }

  private receive(value: unknown): void {
    try {
      if (!isSharedCounterRoomMessage(value)) throw new Error("The live room sent an invalid message.");
      if (value.type === "presence") {
        this.handlers.presence(value.connected, value.replicas);
        return;
      }
      if (value.type === "hello" || value.type === "error" || value.type === "reset") {
        if (value.type === "reset" && value.epoch === this.epoch) return;
        if (value.type === "error" && value.epoch === this.epoch && value.operations.length < this.cursor) {
          throw new Error("The room's stored log is behind its confirmed sequence.");
        }
        if (value.type === "error" && value.epoch === this.epoch) {
          for (const operation of value.operations) this.record(operation);
        }
        this.adopt(value);
        if (value.type === "hello") this.handlers.hello(value);
        else if (value.type === "reset") this.handlers.reset(value);
        else this.handlers.rejected(value.message, value);
        return;
      }
      if (value.epoch !== this.epoch) return;
      if (value.type === "history") {
        this.requestingHistory = false;
        for (const operation of value.operations) this.record(operation);
      } else {
        this.record(value.operation);
      }
      let next = this.operations.get(this.cursor + 1);
      while (next) {
        this.handlers.operation(next);
        this.cursor = next.sequenceNumber;
        next = this.operations.get(this.cursor + 1);
      }
      if (this.operations.size > this.cursor && !this.requestingHistory) {
        if (value.type === "history") throw new Error("The room did not supply the missing operations.");
        this.requestingHistory = true;
        this.socket.send({ type: "history", epoch: this.epoch, after: this.cursor });
        this.handlers.status(`Waiting for SN ${this.cursor + 1}; requested the missing operations.`);
      }
    } catch (error) {
      this.fail(error instanceof Error ? error.message : String(error));
    }
  }

  private fail(message: string): void {
    this.close();
    this.handlers.closed();
    this.handlers.status(message);
  }
}
