import type { Result } from "./build/dev/javascript/prelude.mjs";

export type GCounterRoom$ = object;
export type GCounterRoomSnapshot$ = object;
export type PnCounterRoom$ = object;
export type PnCounterRoomSnapshot$ = object;
export type SharedCounterRoom$ = object;
export type SharedCounterRoomSnapshot$ = object;
export type SetRoom$ = object;
export type SetRoomSnapshot$ = object;
export type MapRoom$ = object;
export type MapRoomSnapshot$ = object;
export type MapEntry$ = object;
export type TransportDelivery$ = object;

export function new_gcounter_room(): Result<GCounterRoom$, string>;
export function new_pncounter_room(): Result<PnCounterRoom$, string>;
export function new_sharedcounter_room(): Result<SharedCounterRoom$, string>;
export function new_set_room(kind: string): Result<SetRoom$, string>;
export function new_map_room(kind: string): Result<MapRoom$, string>;
export function gcounter_room_stage_race(room: GCounterRoom$): Result<GCounterRoom$, string>;
export function gcounter_room_increment(
  room: GCounterRoom$,
  replica: string,
  amount: number,
): Result<GCounterRoom$, string>;
export function gcounter_room_deliver(
  room: GCounterRoom$,
): [GCounterRoom$, Iterable<TransportDelivery$>];
export function gcounter_room_deliver_one(
  room: GCounterRoom$,
): [GCounterRoom$, Iterable<TransportDelivery$>];
export function gcounter_room_resend(
  room: GCounterRoom$,
  replica: string,
): Result<[GCounterRoom$, Iterable<TransportDelivery$>], string>;
export function gcounter_room_snapshot(
  room: GCounterRoom$,
): Result<GCounterRoomSnapshot$, string>;
export function pncounter_room_stage_race(
  room: PnCounterRoom$,
): Result<PnCounterRoom$, string>;
export function pncounter_room_update(
  room: PnCounterRoom$,
  replica: string,
  amount: number,
): Result<PnCounterRoom$, string>;
export function pncounter_room_deliver(
  room: PnCounterRoom$,
): [PnCounterRoom$, Iterable<TransportDelivery$>];
export function pncounter_room_deliver_one(
  room: PnCounterRoom$,
): [PnCounterRoom$, Iterable<TransportDelivery$>];
export function pncounter_room_snapshot(
  room: PnCounterRoom$,
): Result<PnCounterRoomSnapshot$, string>;
export function sharedcounter_room_stage_race(
  room: SharedCounterRoom$,
): Result<SharedCounterRoom$, string>;
export function sharedcounter_room_update(
  room: SharedCounterRoom$,
  replica: string,
  amount: number,
): Result<SharedCounterRoom$, string>;
export function sharedcounter_room_deliver(
  room: SharedCounterRoom$,
): [SharedCounterRoom$, Iterable<TransportDelivery$>];
export function sharedcounter_room_deliver_one(
  room: SharedCounterRoom$,
): [SharedCounterRoom$, Iterable<TransportDelivery$>];
export function sharedcounter_room_snapshot(
  room: SharedCounterRoom$,
): Result<SharedCounterRoomSnapshot$, string>;
export function set_room_stage_race(room: SetRoom$): Result<SetRoom$, string>;
export function set_room_update(
  room: SetRoom$,
  replica: string,
  action: string,
  element: string,
): Result<SetRoom$, string>;
export function set_room_deliver(
  room: SetRoom$,
): [SetRoom$, Iterable<TransportDelivery$>];
export function set_room_deliver_one(
  room: SetRoom$,
): [SetRoom$, Iterable<TransportDelivery$>];
export function set_room_snapshot(room: SetRoom$): SetRoomSnapshot$;
export function map_room_stage_race(room: MapRoom$): Result<MapRoom$, string>;
export function map_room_update(
  room: MapRoom$,
  replica: string,
  action: string,
  key: string,
  value: string,
): Result<MapRoom$, string>;
export function map_room_deliver(
  room: MapRoom$,
): [MapRoom$, Iterable<TransportDelivery$>];
export function map_room_deliver_one(
  room: MapRoom$,
): [MapRoom$, Iterable<TransportDelivery$>];
export function map_room_snapshot(room: MapRoom$): MapRoomSnapshot$;
export function GCounterRoomSnapshot$GCounterRoomSnapshot$a(
  value: GCounterRoomSnapshot$,
): number;
export function GCounterRoomSnapshot$GCounterRoomSnapshot$b(
  value: GCounterRoomSnapshot$,
): number;
export function GCounterRoomSnapshot$GCounterRoomSnapshot$c(
  value: GCounterRoomSnapshot$,
): number;
export function GCounterRoomSnapshot$GCounterRoomSnapshot$pending(
  value: GCounterRoomSnapshot$,
): boolean;
export function GCounterRoomSnapshot$GCounterRoomSnapshot$sequence_number(
  value: GCounterRoomSnapshot$,
): number;
export function PnCounterRoomSnapshot$PnCounterRoomSnapshot$a(
  value: PnCounterRoomSnapshot$,
): number;
export function PnCounterRoomSnapshot$PnCounterRoomSnapshot$b(
  value: PnCounterRoomSnapshot$,
): number;
export function PnCounterRoomSnapshot$PnCounterRoomSnapshot$c(
  value: PnCounterRoomSnapshot$,
): number;
export function PnCounterRoomSnapshot$PnCounterRoomSnapshot$pending(
  value: PnCounterRoomSnapshot$,
): boolean;
export function PnCounterRoomSnapshot$PnCounterRoomSnapshot$sequence_number(
  value: PnCounterRoomSnapshot$,
): number;
export function SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$a(
  value: SharedCounterRoomSnapshot$,
): number;
export function SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$b(
  value: SharedCounterRoomSnapshot$,
): number;
export function SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$c(
  value: SharedCounterRoomSnapshot$,
): number;
export function SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$pending(
  value: SharedCounterRoomSnapshot$,
): boolean;
export function SharedCounterRoomSnapshot$SharedCounterRoomSnapshot$sequence_number(
  value: SharedCounterRoomSnapshot$,
): number;
export function SetRoomSnapshot$SetRoomSnapshot$a(
  value: SetRoomSnapshot$,
): Iterable<string>;
export function SetRoomSnapshot$SetRoomSnapshot$b(
  value: SetRoomSnapshot$,
): Iterable<string>;
export function SetRoomSnapshot$SetRoomSnapshot$c(
  value: SetRoomSnapshot$,
): Iterable<string>;
export function SetRoomSnapshot$SetRoomSnapshot$pending(
  value: SetRoomSnapshot$,
): boolean;
export function SetRoomSnapshot$SetRoomSnapshot$sequence_number(
  value: SetRoomSnapshot$,
): number;
export function MapRoomSnapshot$MapRoomSnapshot$a(
  value: MapRoomSnapshot$,
): Iterable<MapEntry$>;
export function MapRoomSnapshot$MapRoomSnapshot$b(
  value: MapRoomSnapshot$,
): Iterable<MapEntry$>;
export function MapRoomSnapshot$MapRoomSnapshot$c(
  value: MapRoomSnapshot$,
): Iterable<MapEntry$>;
export function MapRoomSnapshot$MapRoomSnapshot$pending(
  value: MapRoomSnapshot$,
): boolean;
export function MapRoomSnapshot$MapRoomSnapshot$sequence_number(
  value: MapRoomSnapshot$,
): number;
export function MapEntry$MapEntry$key(value: MapEntry$): string;
export function MapEntry$MapEntry$value(value: MapEntry$): string;
export function TransportDelivery$TransportDelivery$to(value: TransportDelivery$): string;
export function TransportDelivery$TransportDelivery$event(value: TransportDelivery$): string;
export function TransportDelivery$TransportDelivery$sequence_number(
  value: TransportDelivery$,
): number;
export function TransportDelivery$TransportDelivery$author(value: TransportDelivery$): string;
