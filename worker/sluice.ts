import type { RoomReplica } from "./protocol";
type Session = { readonly replica: RoomReplica | null };
const replicas: readonly RoomReplica[] = ["A", "B", "C"];

export class DurableObjectSluice {
  constructor(private readonly ctx: DurableObjectState) {}

  replica(socket: WebSocket): RoomReplica | null {
    return (socket.deserializeAttachment() as Session | null)?.replica ?? null;
  }

  connect(request: Request, greeting: object): Response {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("Expected a WebSocket upgrade.", { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair());
    const used = new Set(this.ctx.getWebSockets().map((socket) => this.replica(socket)));
    const replica = replicas.find((candidate) => !used.has(candidate)) ?? null;
    server.serializeAttachment({ replica } satisfies Session);
    this.ctx.acceptWebSocket(server);
    server.send(JSON.stringify({
      ...greeting,
      type: "hello",
      room: new URL(request.url).pathname.split("/").at(-1),
      replica,
      connected: this.ctx.getWebSockets().length,
    }));
    this.presence();
    return new Response(null, { status: 101, webSocket: client });
  }

  presence(): void {
    this.broadcast({ type: "presence", connected: this.ctx.getWebSockets().length });
  }

  broadcast(message: object): void {
    const encoded = JSON.stringify(message);
    for (const socket of this.ctx.getWebSockets()) socket.send(encoded);
  }
}
