import { isEpoch, type RoomReplica } from "./protocol";

export const SHARED_COUNTER_INITIAL = 10;
export const MAX_SHARED_OPERATIONS = 1000;
// Include up to 1,000 optimistic edits in addition to the stored log.
export const MAX_SHARED_AMOUNT = Math.floor(
  (Number.MAX_SAFE_INTEGER - SHARED_COUNTER_INITIAL) / (2 * MAX_SHARED_OPERATIONS),
);
export type SequencedCounterOperation = {
  readonly id: string;
  readonly sequenceNumber: number;
  readonly author: RoomReplica;
  readonly amount: number;
};
export type SharedCounterHistory = {
  readonly epoch: string;
  readonly operations: readonly SequencedCounterOperation[];
};
export type SharedCounterClientMessage =
  | { readonly type: "increment"; readonly epoch: string; readonly id: string; readonly amount: number }
  | { readonly type: "history"; readonly epoch: string; readonly after: number }
  | { readonly type: "reset"; readonly epoch: string };

export function isSharedAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value !== 0 && Math.abs(value) <= MAX_SHARED_AMOUNT;
}

export function isSharedSequence(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value)
    && value >= 0 && value <= MAX_SHARED_OPERATIONS;
}

export function isSequencedCounterOperation(value: unknown): value is SequencedCounterOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Record<string, unknown>;
  return isEpoch(operation.id)
    && isSharedSequence(operation.sequenceNumber) && operation.sequenceNumber > 0
    && (operation.author === "A" || operation.author === "B" || operation.author === "C")
    && isSharedAmount(operation.amount);
}

export function isSharedCounterHistory(value: unknown): value is SharedCounterHistory {
  if (!value || typeof value !== "object") return false;
  const history = value as Record<string, unknown>;
  return isEpoch(history.epoch) && Array.isArray(history.operations)
    && history.operations.length <= MAX_SHARED_OPERATIONS
    && history.operations.every(isSequencedCounterOperation);
}

export function parseSharedCounterMessage(value: string | ArrayBuffer): SharedCounterClientMessage | null {
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
  if (message.type === "history" && isSharedSequence(message.after)) {
    return { type: "history", epoch: message.epoch, after: message.after };
  }
  if (message.type === "increment" && isEpoch(message.id) && isSharedAmount(message.amount)) {
    return { type: "increment", epoch: message.epoch, id: message.id, amount: message.amount };
  }
  return null;
}
