export function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
}

export function roomWebSocketUrl(origin: string, room: string, prefix = "/rooms/"): string {
  const url = new URL(`${prefix}${normalizeRoomCode(room)}`, origin);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  return url.toString();
}

export class RoomSocket {
  private socket?: WebSocket;

  constructor(
    private readonly origin: string,
    private readonly handlers: {
      message(value: unknown): void;
      status(message: string): void;
      closed(): void;
    },
    private readonly prefix = "/rooms/",
  ) {}

  connect(room: string): void {
    this.close();
    const socket = new WebSocket(roomWebSocketUrl(this.origin, room, this.prefix));
    this.socket = socket;
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket) return;
      let message: unknown;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        this.handlers.status("The live room sent an invalid message.");
        return;
      }
      this.handlers.message(message);
    });
    socket.addEventListener("error", () => {
      if (this.socket === socket) this.handlers.status("Could not connect to the live room.");
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.socket = undefined;
      this.handlers.closed();
    });
  }

  send(message: object): void {
    if (this.socket?.readyState !== WebSocket.OPEN) throw new Error("The live room is not connected.");
    this.socket.send(JSON.stringify(message));
  }

  close(): void {
    const socket = this.socket;
    this.socket = undefined;
    socket?.close(1000, "left room");
  }
}
