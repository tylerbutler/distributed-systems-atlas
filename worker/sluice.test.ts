import { expect, test, vi } from "vitest";
import { DurableObjectSluice } from "./sluice";

test("presence and broadcasts exclude closing sockets and retain the actual occupied roles", () => {
  const alice = vi.fn();
  const bob = vi.fn();
  const carol = vi.fn();
  const sockets = [
    { readyState: WebSocket.OPEN, deserializeAttachment: () => ({ replica: "A" }), send: alice },
    { readyState: WebSocket.CLOSING, deserializeAttachment: () => ({ replica: "B" }), send: bob },
    { readyState: WebSocket.OPEN, deserializeAttachment: () => ({ replica: "C" }), send: carol },
    { readyState: WebSocket.OPEN, deserializeAttachment: () => ({ replica: null }), send: vi.fn() },
  ] as WebSocket[];
  const ctx = { getWebSockets: () => sockets } as DurableObjectState;
  const sluice = new DurableObjectSluice(ctx);
  sluice.presence();
  const presence = JSON.stringify({ type: "presence", connected: 3, replicas: ["A", "C"] });
  expect(alice).toHaveBeenCalledWith(presence);
  expect(carol).toHaveBeenCalledWith(presence);
  expect(bob).not.toHaveBeenCalled();
  sluice.broadcast({ type: "state" });
  expect(alice).toHaveBeenLastCalledWith('{"type":"state"}');
  expect(bob).not.toHaveBeenCalled();
});
