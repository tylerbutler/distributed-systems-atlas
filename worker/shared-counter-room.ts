import { DurableObject } from "cloudflare:workers";
import { DurableObjectSluice } from "./sluice";
import {
  MAX_SHARED_OPERATIONS,
  parseSharedCounterMessage,
  type SequencedCounterOperation,
  type SharedCounterHistory,
} from "./shared-counter-protocol";

export class SharedCounterRoom extends DurableObject<unknown> {
  private readonly sluice: DurableObjectSluice;

  constructor(ctx: DurableObjectState, env: unknown) {
    super(ctx, env);
    this.sluice = new DurableObjectSluice(ctx);
    ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS room (
        singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
        epoch TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS operations (
        sequenceNumber INTEGER PRIMARY KEY,
        id TEXT NOT NULL UNIQUE,
        author TEXT NOT NULL CHECK (author IN ('A', 'B', 'C')),
        amount INTEGER NOT NULL
      )
    `);
    ctx.storage.sql.exec(
      "INSERT OR IGNORE INTO room (singleton, epoch) VALUES (1, ?)", crypto.randomUUID(),
    );
  }

  fetch(request: Request): Response {
    return this.sluice.connect(request, this.history());
  }

  webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): void {
    const message = parseSharedCounterMessage(raw);
    if (!message) {
      this.reject(socket, "The room rejected an invalid signed operation.");
      return;
    }
    if (message.epoch !== this.epoch()) {
      this.reject(socket, "The room was reset. Earlier unconfirmed changes were discarded.");
      return;
    }
    if (message.type === "history") {
      socket.send(JSON.stringify({ type: "history", ...this.history(message.after) }));
      return;
    }
    const author = this.sluice.replica(socket);
    if (!author) {
      this.reject(socket, "This device is observing. Three hikers are already connected.");
      return;
    }
    if (message.type === "reset") {
      this.ctx.storage.transactionSync(() => {
        this.ctx.storage.sql.exec("DELETE FROM operations");
        this.ctx.storage.sql.exec(
          "UPDATE room SET epoch = ? WHERE singleton = 1", crypto.randomUUID(),
        );
      });
      this.sluice.broadcast({ type: "reset", ...this.history() });
      return;
    }
    const [existing] = this.ctx.storage.sql.exec<SequencedCounterOperation>(
      "SELECT id, sequenceNumber, author, amount FROM operations WHERE id = ?", message.id,
    );
    if (existing) {
      if (existing.author !== author || existing.amount !== message.amount) {
        this.reject(socket, "The action ID was already used for a different signed operation.");
      } else {
        socket.send(JSON.stringify({ type: "operation", epoch: message.epoch, operation: existing }));
      }
      return;
    }
    const { latest } = this.ctx.storage.sql.exec<{ latest: number }>(
      "SELECT COALESCE(MAX(sequenceNumber), 0) AS latest FROM operations",
    ).one();
    if (latest >= MAX_SHARED_OPERATIONS) {
      this.reject(socket, "This demo room has 1,000 operations. Reset the room to continue.");
      return;
    }
    const operation: SequencedCounterOperation = {
      id: message.id, sequenceNumber: latest + 1, author, amount: message.amount,
    };
    this.ctx.storage.sql.exec(
      "INSERT INTO operations (id, sequenceNumber, author, amount) VALUES (?, ?, ?, ?)",
      operation.id, operation.sequenceNumber, operation.author, operation.amount,
    );
    this.sluice.broadcast({ type: "operation", epoch: message.epoch, operation });
  }

  webSocketClose(): void {
    this.sluice.presence();
  }

  webSocketError(): void {
    this.sluice.presence();
  }

  private epoch(): string {
    return this.ctx.storage.sql.exec<{ epoch: string }>(
      "SELECT epoch FROM room WHERE singleton = 1",
    ).one().epoch;
  }

  private history(after = 0): SharedCounterHistory {
    return {
      epoch: this.epoch(),
      operations: [...this.ctx.storage.sql.exec<SequencedCounterOperation>(
        "SELECT id, sequenceNumber, author, amount FROM operations WHERE sequenceNumber > ? ORDER BY sequenceNumber",
        after,
      )],
    };
  }

  private reject(socket: WebSocket, message: string): void {
    socket.send(JSON.stringify({ type: "error", message, ...this.history() }));
  }
}
