import { DurableObject } from "cloudflare:workers";
import { parseClientMessage, ROOM_CODE, type RoomState } from "./protocol";

type ReplicaId = "A" | "B" | "C";
type Session = { readonly replica: ReplicaId | null };
type StoredCounter = {
  readonly epoch: string;
  readonly a: number;
  readonly b: number;
  readonly c: number;
};

interface Env {
  G_COUNTER_ROOMS: DurableObjectNamespace<GCounterRoom>;
}

const replicas: readonly ReplicaId[] = ["A", "B", "C"];

export class GCounterRoom extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS counter (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        epoch TEXT NOT NULL,
        a INTEGER NOT NULL,
        b INTEGER NOT NULL,
        c INTEGER NOT NULL
      )
    `);
    if ([...this.ctx.storage.sql.exec("SELECT singleton FROM counter")].length === 0) {
      const legacy = [...this.ctx.storage.sql.exec(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'events'",
      )].length > 0;
      const counts = legacy
        ? [...this.ctx.storage.sql.exec<Omit<StoredCounter, "epoch">>(`
          SELECT
            COALESCE(SUM(CASE WHEN replica = 'A' THEN amount ELSE 0 END), 0) AS a,
            COALESCE(SUM(CASE WHEN replica = 'B' THEN amount ELSE 0 END), 0) AS b,
            COALESCE(SUM(CASE WHEN replica = 'C' THEN amount ELSE 0 END), 0) AS c
          FROM events
        `)][0]
        : { a: 0, b: 0, c: 0 };
      this.ctx.storage.sql.exec(
        "INSERT INTO counter (singleton, epoch, a, b, c) VALUES (1, ?, ?, ?, ?)",
        crypto.randomUUID(), counts.a, counts.b, counts.c,
      );
    }
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
      state: this.snapshot(),
      connected: this.ctx.getWebSockets().length,
    }));
    this.broadcastPresence();
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(socket: WebSocket, value: string | ArrayBuffer): void {
    const session = socket.deserializeAttachment() as Session | null;
    const message = parseClientMessage(value);
    if (!message) {
      this.reject(socket, "The room rejected invalid state. Reload the page if it uses an older room protocol.");
      return;
    }
    if (!session?.replica) {
      this.reject(socket, "This device is observing. Three hikers are already connected.");
      return;
    }
    const current = this.snapshot();
    if (message.epoch !== current.epoch) {
      this.reject(socket, "The room was reset. Changes from the previous room state were discarded.");
      return;
    }
    if (message.type === "reset") {
      this.ctx.storage.sql.exec(
        "UPDATE counter SET epoch = ?, a = 0, b = 0, c = 0 WHERE singleton = 1",
        crypto.randomUUID(),
      );
      this.broadcast({ type: "reset", state: this.snapshot() });
      return;
    }
    if (message.count <= current.counts[session.replica]) {
      socket.send(JSON.stringify({ type: "state", state: current }));
      return;
    }
    const column = { A: "a", B: "b", C: "c" }[session.replica];
    this.ctx.storage.sql.exec(
      `UPDATE counter SET ${column} = MAX(${column}, ?) WHERE singleton = 1`,
      message.count,
    );
    this.broadcast({ type: "state", state: this.snapshot() });
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

  private snapshot(): RoomState {
    const [counter] = this.ctx.storage.sql.exec<StoredCounter>(
      "SELECT epoch, a, b, c FROM counter WHERE singleton = 1",
    );
    if (!counter) throw new Error("The room's stored counter is missing.");
    return { epoch: counter.epoch, counts: { A: counter.a, B: counter.b, C: counter.c } };
  }

  private reject(socket: WebSocket, message: string): void {
    socket.send(JSON.stringify({ type: "error", message, state: this.snapshot() }));
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
