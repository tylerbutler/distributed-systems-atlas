import { DurableObject } from "cloudflare:workers";
import { parseClientMessage, ROOM_CODE } from "./protocol";

type ReplicaId = "A" | "B" | "C";
type Session = { readonly replica: ReplicaId | null };
type StoredEvent = {
  readonly id: string;
  readonly sequence: number;
  readonly replica: ReplicaId;
  readonly amount: 1 | 3 | 7;
};

interface Env {
  G_COUNTER_ROOMS: DurableObjectNamespace<GCounterRoom>;
}

const replicas: readonly ReplicaId[] = ["A", "B", "C"];

export class GCounterRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        id TEXT NOT NULL UNIQUE,
        replica TEXT NOT NULL,
        amount INTEGER NOT NULL
      )
    `);
  }

  fetch(request: Request): Response {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const used = new Set(
      this.ctx.getWebSockets()
        .map((socket) => socket.deserializeAttachment() as Session | null)
        .map((session) => session?.replica)
        .filter((replica): replica is ReplicaId => replica !== null && replica !== undefined),
    );
    const replica = replicas.find((candidate) => !used.has(candidate)) ?? null;
    server.serializeAttachment({ replica } satisfies Session);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({
      type: "hello",
      room: new URL(request.url).pathname.split("/").at(-1),
      replica,
      events: [...this.ctx.storage.sql.exec<StoredEvent>(
        "SELECT id, sequence, replica, amount FROM events ORDER BY sequence",
      )],
      connected: this.ctx.getWebSockets().length,
    }));
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, value: string | ArrayBuffer): void {
    const session = socket.deserializeAttachment() as Session | null;
    const message = parseClientMessage(value);
    if (!message) {
      socket.send(JSON.stringify({ type: "error", message: "The room rejected an invalid action." }));
      return;
    }
    if (!session?.replica) {
      socket.send(JSON.stringify({ type: "error", message: "This device is observing. Three hikers are already connected." }));
      return;
    }
    if (message.type === "reset") {
      this.ctx.storage.sql.exec("DELETE FROM events");
      this.broadcast({ type: "reset" });
      return;
    }
    const count = [...this.ctx.storage.sql.exec<{ count: number }>(
      "SELECT COUNT(*) AS count FROM events",
    )][0]?.count ?? 0;
    if (count >= 1000) {
      socket.send(JSON.stringify({
        type: "error",
        message: "This room reached 1,000 operations. Reset the room before adding more.",
      }));
      return;
    }
    const duplicate = [...this.ctx.storage.sql.exec<{ id: string }>(
      "SELECT id FROM events WHERE id = ?",
      message.id,
    )][0];
    if (duplicate) return;
    this.ctx.storage.sql.exec(
      "INSERT INTO events (id, replica, amount) VALUES (?, ?, ?)",
      message.id,
      session.replica,
      message.amount,
    );
    const event = [...this.ctx.storage.sql.exec<StoredEvent>(
      "SELECT id, sequence, replica, amount FROM events WHERE id = ?",
      message.id,
    )][0];
    if (event) this.broadcast({ type: "increment", event });
  }

  webSocketClose(): void {
    this.broadcastPresence();
  }

  webSocketError(): void {
    this.broadcastPresence();
  }

  private broadcastPresence(): void {
    this.broadcast({ type: "presence", connected: this.ctx.getWebSockets().length });
  }

  private broadcast(message: object): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) socket.send(encoded);
  }
}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    const match = url.pathname.match(/^\/rooms\/([A-Z0-9]{4,8})$/);
    if (!match || !ROOM_CODE.test(match[1])) {
      return new Response("Not found.", { status: 404 });
    }
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) {
      return new Response("Origin not allowed.", { status: 403 });
    }
    return env.G_COUNTER_ROOMS.getByName(match[1]).fetch(request);
  },
} satisfies ExportedHandler<Env>;
