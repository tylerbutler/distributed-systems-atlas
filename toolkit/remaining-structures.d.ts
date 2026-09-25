export type RemainingDemoKind =
  | "shared-sequence"
  | "shared-text"
  | "claims"
  | "fifo-work-queue"
  | "task-manager"
  | "pact-map"
  | "json-ot"
  | "shared-rich-text";

export type RemainingDemoReplica = "A" | "B" | "C";

declare const remainingDemoRoomBrand: unique symbol;
export type RemainingDemoRoom = { readonly [remainingDemoRoomBrand]: true };

export type RemainingDemoView = {
  replicas: Array<{ id: RemainingDemoReplica; values: string[] }>;
  pending: number;
  sequenceNumber: number;
};

export type RemainingDemoResult = {
  room: RemainingDemoRoom;
  view: RemainingDemoView;
};

export type RemainingDemoOperationResult<T> =
  | { ok: true; value: T }
  | {
    ok: false;
    error: {
      tag: "invalid-input" | "invalid-state";
      message: string;
    };
  };

export function createRemainingDemoRoom(
  kind: unknown,
): RemainingDemoOperationResult<RemainingDemoResult>;

export function actRemainingDemo(
  current: unknown,
  replica: unknown,
): RemainingDemoOperationResult<RemainingDemoResult>;

export function insertRemainingSequenceStop(
  current: unknown,
  replica: unknown,
  index: unknown,
  stop: unknown,
): RemainingDemoOperationResult<RemainingDemoResult>;

export function editRemainingSharedText(
  current: unknown,
  replica: unknown,
  start: unknown,
  end: unknown,
  inserted: unknown,
): RemainingDemoOperationResult<RemainingDemoResult>;

export function stageRemainingDemoRace(
  current: unknown,
): RemainingDemoOperationResult<RemainingDemoResult>;

export function deliverRemainingDemo(
  current: unknown,
): RemainingDemoOperationResult<RemainingDemoResult>;
