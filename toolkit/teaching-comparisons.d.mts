declare const moveBrand: unique symbol;
declare const textBrand: unique symbol;
export type MoveComparisonHandle = { readonly [moveBrand]: true };
export type TextComparisonHandle = { readonly [textBrand]: true };
export type ComparisonPhase = "ready" | "staged" | "delivered";
export type ComparisonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { tag: "invalid-input" | "invalid-handle" | "invalid-state" | "kernel-error"; message: string } };
export type TrailRecord = { id: string; value: string };
export type MoveComparisonView = {
  phase: ComparisonPhase;
  evidence: string[];
  clients: { id: "A" | "B" | "C"; records: TrailRecord[] }[];
};
export type TextComparisonView = {
  phase: ComparisonPhase;
  evidence: string[];
  clients: { id: "A" | "B" | "C"; crdt: string; ot: string }[];
};
export type MoveComparisonState = { room: MoveComparisonHandle; view: MoveComparisonView };
export type TextComparisonState = { room: TextComparisonHandle; view: TextComparisonView };
export function createMoveComparison(): ComparisonResult<MoveComparisonState>;
export function stageMoveComparison(room: MoveComparisonHandle): ComparisonResult<MoveComparisonState>;
export function deliverMoveComparison(room: MoveComparisonHandle, reverse?: boolean): ComparisonResult<MoveComparisonState>;
export function createTextComparison(): ComparisonResult<TextComparisonState>;
export function stageTextComparison(room: TextComparisonHandle): ComparisonResult<TextComparisonState>;
export function deliverTextComparison(room: TextComparisonHandle, reverse?: boolean): ComparisonResult<TextComparisonState>;
