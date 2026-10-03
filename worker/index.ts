import { DurableObject } from "cloudflare:workers";
import { parseClientMessage, ROOM_CODE, type RoomState } from "./protocol";
import { DurableObjectSluice } from "./sluice";
import { SharedCounterRoom } from "./shared-counter-room";
export { SharedCounterRoom };

type StoredCounter = {
  readonly epoch: string;
  readonly a: number;
  readonly b: number;
  readonly c: number;
};

interface Env {
  G_COUNTER_ROOMS: DurableObjectNamespace<GCounterRoom>;
  SHARED_COUNTER_ROOMS: DurableObjectNamespace<SharedCounterRoom>;
}

export class GCounterRoom extends DurableObject<Env> {
  private readonly sluice: DurableObjectSluice;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sluice = new DurableObjectSluice(ctx);
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
    return this.sluice.connect(request, { state: this.snapshot() });
  }

  webSocketMessage(socket: WebSocket, value: string | ArrayBuffer): void {
    const replica = this.sluice.replica(socket);
    const message = parseClientMessage(value);
    if (!message) {
      this.reject(socket, "The room rejected invalid state. Reload the page if it uses an older room protocol.");
      return;
    }
    if (!replica) {
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
      this.sluice.broadcast({ type: "reset", state: this.snapshot() });
      return;
    }
    if (message.count <= current.counts[replica]) {
      socket.send(JSON.stringify({ type: "state", state: current }));
      return;
    }
    const column = { A: "a", B: "b", C: "c" }[replica];
    this.ctx.storage.sql.exec(
      `UPDATE counter SET ${column} = MAX(${column}, ?) WHERE singleton = 1`,
      message.count,
    );
    this.sluice.broadcast({ type: "state", state: this.snapshot() });
  }

  webSocketClose(): void {
    this.sluice.presence();
  }

  webSocketError(): void {
    this.sluice.presence();
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

}

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return new Response("ok");
    const match = url.pathname.match(/^\/rooms\/(shared-counter\/)?([A-Z0-9]{4,8})$/);
    if (!match || !ROOM_CODE.test(match[2])) {
      return new Response("Not found.", { status: 404 });
    }
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) {
      return new Response("Origin not allowed.", { status: 403 });
    }
    const namespace = match[1] ? env.SHARED_COUNTER_ROOMS : env.G_COUNTER_ROOMS;
    return namespace.getByName(match[2]).fetch(request);
  },
} satisfies ExportedHandler<Env>;
