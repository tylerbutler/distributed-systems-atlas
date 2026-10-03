export const ROOM_CODE = /^[A-Z0-9]{4,8}$/;
export const INCREMENTS = new Set([1, 3, 7]);

export type ClientIncrement = {
  readonly type: "increment";
  readonly id: string;
  readonly amount: 1 | 3 | 7;
};

export type ClientMessage = ClientIncrement | { readonly type: "reset" };

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
  if (message.type === "reset") return { type: "reset" };
  if (
    message.type !== "increment"
    || typeof message.id !== "string"
    || !/^[0-9a-f-]{36}$/i.test(message.id)
    || typeof message.amount !== "number"
    || !INCREMENTS.has(message.amount)
  ) return null;
  return {
    type: "increment",
    id: message.id,
    amount: message.amount as 1 | 3 | 7,
  };
}
