export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;
export type RoomReplica = "A" | "B" | "C";
export type RoomPresence = {
  readonly connected: number;
  readonly replicas?: readonly RoomReplica[];
};
export const MAX_COMPONENT = Math.floor(Number.MAX_SAFE_INTEGER / 3);
const EPOCH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RoomCounts = { readonly A: number; readonly B: number; readonly C: number };
export type RoomState = {
  readonly epoch: string;
  readonly counts: RoomCounts;
};

export type ClientMessage =
  | { readonly type: "state"; readonly epoch: string; readonly count: number }
  | { readonly type: "reset"; readonly epoch: string };

export function isRoomPresence(value: unknown): value is RoomPresence {
  if (!value || typeof value !== "object") return false;
  const presence = value as Record<string, unknown>;
  return typeof presence.connected === "number"
    && Number.isSafeInteger(presence.connected) && presence.connected >= 0
    && (presence.replicas === undefined || (
      Array.isArray(presence.replicas)
      && presence.replicas.length <= Math.min(3, presence.connected)
      && new Set(presence.replicas).size === presence.replicas.length
      && presence.replicas.every((replica) => replica === "A" || replica === "B" || replica === "C")
    ));
}

export function isEpoch(value: unknown): value is string {
  return typeof value === "string" && EPOCH.test(value);
}

export function isCount(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value) && value >= 0 && value <= MAX_COMPONENT;
}

export function isRoomState(value: unknown): value is RoomState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;
  if (!isEpoch(state.epoch) || !state.counts || typeof state.counts !== "object") return false;
  const counts = state.counts as Record<string, unknown>;
  return isCount(counts.A) && isCount(counts.B) && isCount(counts.C);
}

export function parseClientMessage(value: string | ArrayBuffer): ClientMessage | null {
  if (typeof value !== "string" || value.length > 256) return null;
  let input: unknown;
  try {
    input = JSON.parse(value);
  } catch {
    return null;
  }
  if (!input || typeof input !== "object") return null;
  const message = input as Record<string, unknown>;
  if (!isEpoch(message.epoch)) return null;
  if (message.type === "reset") return { type: "reset", epoch: message.epoch };
  if (message.type !== "state" || !isCount(message.count)) return null;
  return { type: "state", epoch: message.epoch, count: message.count };
}
