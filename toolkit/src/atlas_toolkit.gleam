//// Pure, ack-free operations for this site's demos and later Gleam examples.
//// The kernels own state transitions. Snapshot records expose metadata only.

import gleam/dict
import gleam/dynamic/decode
import gleam/int
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import lattice_core/replica_id
import watershed/g_counter_kernel
import watershed/lww_register_kernel
import watershed/mv_register_kernel
import watershed/or_set_kernel
import watershed/pn_counter_kernel
import watershed/register_collection_kernel

pub opaque type Register {
  Register(state: mv_register_kernel.MvRegisterState)
}

pub opaque type ObservedSet {
  ObservedSet(state: or_set_kernel.OrSetState)
}

pub opaque type GrowOnlyCounter {
  GrowOnlyCounter(state: g_counter_kernel.GCounterState)
}

pub opaque type PositiveNegativeCounter {
  PositiveNegativeCounter(state: pn_counter_kernel.PnCounterState)
}

pub opaque type RegisterDemoRoom {
  LwwRegisterRoom(
    a: lww_register_kernel.LwwRegisterState,
    b: lww_register_kernel.LwwRegisterState,
    c: lww_register_kernel.LwwRegisterState,
    pending: List(lww_register_kernel.LwwRegisterOperation),
  )
  MvRegisterRoom(
    a: mv_register_kernel.MvRegisterState,
    b: mv_register_kernel.MvRegisterState,
    c: mv_register_kernel.MvRegisterState,
    pending: List(mv_register_kernel.MvRegisterState),
  )
  RegisterMapRoom(
    a: register_collection_kernel.RegisterState,
    b: register_collection_kernel.RegisterState,
    c: register_collection_kernel.RegisterState,
    pending: List(register_collection_kernel.WriteOperation),
    sequence_number: Int,
  )
}

pub type Tag {
  Tag(replica_id: String, counter: Int)
}

pub type CounterEntry {
  CounterEntry(replica_id: String, count: Int)
}

pub type MvEntry {
  MvEntry(tag: Tag, value: String)
}

pub type SetEntry {
  SetEntry(value: String, tags: List(Tag))
}

pub type MvSnapshot {
  MvSnapshot(entries: List(MvEntry), clock: List(Tag))
}

pub type SetSnapshot {
  SetSnapshot(counter: Int, entries: List(SetEntry), tombstones: List(Tag))
}

pub type GCounterSnapshot {
  GCounterSnapshot(value: Int, counts: List(CounterEntry))
}

pub type PnCounterSnapshot {
  PnCounterSnapshot(
    value: Int,
    positive: List(CounterEntry),
    negative: List(CounterEntry),
  )
}

pub type RegisterDemoSnapshot {
  RegisterDemoSnapshot(
    a: List(String),
    b: List(String),
    c: List(String),
    pending: Int,
    sequence_number: Int,
    winner_author: String,
    timestamp: Int,
    atomic_value: String,
    latest_value: String,
    versions: List(String),
  )
}

pub fn new_gcounter(replica: String) -> GrowOnlyCounter {
  GrowOnlyCounter(g_counter_kernel.new(replica_id.new(replica)))
}

pub fn gcounter_increment(
  counter: GrowOnlyCounter,
  amount: Int,
) -> Result(#(GrowOnlyCounter, GrowOnlyCounter), g_counter_kernel.EditError) {
  let GrowOnlyCounter(state) = counter
  use #(next, _, operation) <- result.try(g_counter_kernel.p2p_increment(
    state,
    amount,
  ))
  let g_counter_kernel.Increment(_, delta) = operation
  Ok(#(
    GrowOnlyCounter(next),
    GrowOnlyCounter(g_counter_kernel.from_sequenced(delta, state.replica_id)),
  ))
}

pub fn gcounter_merge(
  counter: GrowOnlyCounter,
  remote: GrowOnlyCounter,
) -> GrowOnlyCounter {
  let GrowOnlyCounter(state) = counter
  let GrowOnlyCounter(remote) = remote
  GrowOnlyCounter(g_counter_kernel.p2p_merge(state, remote.sequenced).0)
}

pub fn gcounter_restore(
  source: String,
  replica: String,
) -> Result(GrowOnlyCounter, json.DecodeError) {
  g_counter_kernel.from_summary(source, replica_id.new(replica))
  |> result.map(GrowOnlyCounter)
}

pub fn gcounter_snapshot(counter: GrowOnlyCounter) -> GCounterSnapshot {
  let GrowOnlyCounter(state) = counter
  let decoder = {
    use snapshot <- decode.field("state", {
      use counts <- decode.field(
        "counts",
        decode.dict(decode.string, decode.int),
      )
      decode.success(GCounterSnapshot(
        g_counter_kernel.value(state),
        dict.to_list(counts)
          |> list.map(fn(entry) { CounterEntry(entry.0, entry.1) })
          |> list.sort(fn(a, b) { string.compare(a.replica_id, b.replica_id) }),
      ))
    })
    decode.success(snapshot)
  }
  let assert Ok(snapshot) =
    state |> g_counter_kernel.summary |> json.to_string |> json.parse(decoder)
  snapshot
}

pub fn new_pncounter(replica: String) -> PositiveNegativeCounter {
  PositiveNegativeCounter(pn_counter_kernel.new(replica_id.new(replica)))
}

pub fn pncounter_update(
  counter: PositiveNegativeCounter,
  amount: Int,
) -> #(PositiveNegativeCounter, PositiveNegativeCounter) {
  let PositiveNegativeCounter(state) = counter
  let #(next, _, operation) = pn_counter_kernel.p2p_update(state, amount)
  let pn_counter_kernel.Update(_, delta) = operation
  #(
    PositiveNegativeCounter(next),
    PositiveNegativeCounter(pn_counter_kernel.from_sequenced(
      delta,
      state.replica_id,
    )),
  )
}

pub fn pncounter_merge(
  counter: PositiveNegativeCounter,
  remote: PositiveNegativeCounter,
) -> PositiveNegativeCounter {
  let PositiveNegativeCounter(state) = counter
  let PositiveNegativeCounter(remote) = remote
  PositiveNegativeCounter(
    pn_counter_kernel.p2p_merge(state, remote.sequenced).0,
  )
}

pub fn pncounter_restore(
  source: String,
  replica: String,
) -> Result(PositiveNegativeCounter, json.DecodeError) {
  pn_counter_kernel.from_summary(source, replica_id.new(replica))
  |> result.map(PositiveNegativeCounter)
}

fn counter_entries_decoder() -> decode.Decoder(List(CounterEntry)) {
  decode.dict(decode.string, decode.int)
  |> decode.map(fn(counts) {
    dict.to_list(counts)
    |> list.map(fn(entry) { CounterEntry(entry.0, entry.1) })
    |> list.sort(fn(a, b) { string.compare(a.replica_id, b.replica_id) })
  })
}

fn counter_half_decoder() -> decode.Decoder(List(CounterEntry)) {
  use counts <- decode.field("counts", counter_entries_decoder())
  decode.success(counts)
}

pub fn pncounter_snapshot(
  counter: PositiveNegativeCounter,
) -> PnCounterSnapshot {
  let PositiveNegativeCounter(state) = counter
  let decoder = {
    use snapshot <- decode.field("state", {
      use positive <- decode.field("positive", counter_half_decoder())
      use negative <- decode.field("negative", counter_half_decoder())
      decode.success(PnCounterSnapshot(
        pn_counter_kernel.value(state),
        positive,
        negative,
      ))
    })
    decode.success(snapshot)
  }
  let assert Ok(snapshot) =
    state |> pn_counter_kernel.summary |> json.to_string |> json.parse(decoder)
  snapshot
}

pub fn new_mv(replica: String) -> Register {
  Register(mv_register_kernel.new(replica_id.new(replica)))
}

pub fn new_register_demo(kind: String) -> Result(RegisterDemoRoom, String) {
  case kind {
    "lww-register" ->
      Ok(
        LwwRegisterRoom(
          lww_register_kernel.new(replica_id.new("A")),
          lww_register_kernel.new(replica_id.new("B")),
          lww_register_kernel.new(replica_id.new("C")),
          [],
        ),
      )
    "mv-register" ->
      Ok(
        MvRegisterRoom(
          mv_register_kernel.new(replica_id.new("A")),
          mv_register_kernel.new(replica_id.new("B")),
          mv_register_kernel.new(replica_id.new("C")),
          [],
        ),
      )
    "register-map" ->
      Ok(RegisterMapRoom(
        register_collection_kernel.new(),
        register_collection_kernel.new(),
        register_collection_kernel.new(),
        [],
        0,
      ))
    _ ->
      Error(
        "the register kind must be lww-register, mv-register, or register-map",
      )
  }
}

pub fn register_demo_stage_race(
  room: RegisterDemoRoom,
) -> Result(RegisterDemoRoom, String) {
  case room {
    LwwRegisterRoom(a, b, c, _) -> {
      use #(a, a_operation) <- result.try(lww_demo_write(a, "Trail open", 1))
      use #(b, b_operation) <- result.try(lww_demo_write(b, "Trail closed", 2))
      Ok(LwwRegisterRoom(a, b, c, [a_operation, b_operation]))
    }
    MvRegisterRoom(a, b, c, _) -> {
      let #(a, _, mv_register_kernel.Set(_, a_delta)) =
        mv_register_kernel.p2p_set(a, "Trail open")
      let #(b, _, mv_register_kernel.Set(_, b_delta)) =
        mv_register_kernel.p2p_set(b, "Trail closed")
      Ok(
        MvRegisterRoom(a, b, c, [
          mv_register_kernel.from_sequenced(a_delta, a.replica_id),
          mv_register_kernel.from_sequenced(b_delta, b.replica_id),
        ]),
      )
    }
    RegisterMapRoom(a, b, c, _, sequence_number) ->
      Ok(RegisterMapRoom(
        a,
        b,
        c,
        [
          register_collection_kernel.write(
            a,
            "trail-status",
            json.string("Trail open"),
            sequence_number,
          ),
          register_collection_kernel.write(
            b,
            "trail-status",
            json.string("Trail closed"),
            sequence_number,
          ),
        ],
        sequence_number,
      ))
  }
}

pub fn register_demo_write(
  room: RegisterDemoRoom,
  replica: String,
  value: String,
) -> Result(RegisterDemoRoom, String) {
  case room {
    LwwRegisterRoom(a, b, c, pending) -> {
      let sequence_number =
        int.max(a.last_seen, int.max(b.last_seen, c.last_seen)) + 1
      case replica {
        "A" -> {
          use #(a, operation) <- result.try(lww_demo_write(
            a,
            value,
            sequence_number,
          ))
          Ok(LwwRegisterRoom(a, b, c, list.append(pending, [operation])))
        }
        "B" -> {
          use #(b, operation) <- result.try(lww_demo_write(
            b,
            value,
            sequence_number,
          ))
          Ok(LwwRegisterRoom(a, b, c, list.append(pending, [operation])))
        }
        "C" -> {
          use #(c, operation) <- result.try(lww_demo_write(
            c,
            value,
            sequence_number,
          ))
          Ok(LwwRegisterRoom(a, b, c, list.append(pending, [operation])))
        }
        _ -> Error("the register replica must be A, B, or C")
      }
    }
    MvRegisterRoom(a, b, c, pending) ->
      case replica {
        "A" -> {
          let #(a, _, mv_register_kernel.Set(_, delta)) =
            mv_register_kernel.p2p_set(a, value)
          Ok(MvRegisterRoom(
            a,
            b,
            c,
            list.append(pending, [
              mv_register_kernel.from_sequenced(delta, a.replica_id),
            ]),
          ))
        }
        "B" -> {
          let #(b, _, mv_register_kernel.Set(_, delta)) =
            mv_register_kernel.p2p_set(b, value)
          Ok(MvRegisterRoom(
            a,
            b,
            c,
            list.append(pending, [
              mv_register_kernel.from_sequenced(delta, b.replica_id),
            ]),
          ))
        }
        "C" -> {
          let #(c, _, mv_register_kernel.Set(_, delta)) =
            mv_register_kernel.p2p_set(c, value)
          Ok(MvRegisterRoom(
            a,
            b,
            c,
            list.append(pending, [
              mv_register_kernel.from_sequenced(delta, c.replica_id),
            ]),
          ))
        }
        _ -> Error("the register replica must be A, B, or C")
      }
    RegisterMapRoom(a, b, c, pending, sequence_number) -> {
      let state = case replica {
        "A" -> Ok(a)
        "B" -> Ok(b)
        "C" -> Ok(c)
        _ -> Error("the register replica must be A, B, or C")
      }
      use state <- result.try(state)
      let operation =
        register_collection_kernel.write(
          state,
          "trail-status",
          json.string(value),
          sequence_number,
        )
      Ok(RegisterMapRoom(
        a,
        b,
        c,
        list.append(pending, [operation]),
        sequence_number,
      ))
    }
  }
}

pub fn register_demo_deliver(room: RegisterDemoRoom) -> RegisterDemoRoom {
  case room {
    LwwRegisterRoom(a, b, c, pending) -> {
      let #(a, b, c) =
        list.fold(pending, #(a, b, c), fn(states, operation) {
          let assert Ok(#(a, _)) =
            lww_register_kernel.apply_remote(states.0, operation)
          let assert Ok(#(b, _)) =
            lww_register_kernel.apply_remote(states.1, operation)
          let assert Ok(#(c, _)) =
            lww_register_kernel.apply_remote(states.2, operation)
          #(a, b, c)
        })
      LwwRegisterRoom(a, b, c, [])
    }
    MvRegisterRoom(a, b, c, pending) -> {
      let #(a, b, c) =
        list.fold(pending, #(a, b, c), fn(states, delta) {
          #(
            mv_register_kernel.p2p_merge(states.0, delta.sequenced).0,
            mv_register_kernel.p2p_merge(states.1, delta.sequenced).0,
            mv_register_kernel.p2p_merge(states.2, delta.sequenced).0,
          )
        })
      MvRegisterRoom(a, b, c, [])
    }
    RegisterMapRoom(a, b, c, pending, sequence_number) -> {
      let #(a, b, c, sequence_number) =
        list.fold(pending, #(a, b, c, sequence_number), fn(states, operation) {
          let sequence_number = states.3 + 1
          #(
            register_collection_kernel.apply_remote(
              states.0,
              operation,
              sequence_number,
            ).0,
            register_collection_kernel.apply_remote(
              states.1,
              operation,
              sequence_number,
            ).0,
            register_collection_kernel.apply_remote(
              states.2,
              operation,
              sequence_number,
            ).0,
            sequence_number,
          )
        })
      RegisterMapRoom(a, b, c, [], sequence_number)
    }
  }
}

fn lww_demo_write(
  state: lww_register_kernel.LwwRegisterState,
  value: String,
  timestamp: Int,
) -> Result(
  #(
    lww_register_kernel.LwwRegisterState,
    lww_register_kernel.LwwRegisterOperation,
  ),
  String,
) {
  lww_register_kernel.p2p_set(state, value, timestamp)
  |> result.map(fn(update) {
    let #(next, _, operation) = update
    #(next, operation)
  })
  |> result.map_error(fn(_) { "LWW timestamp is invalid" })
}

fn json_string_value(value: json.Json) -> String {
  value
  |> json.to_string
  |> json.parse(decode.string)
  |> result.unwrap("")
}

fn collection_value(
  state: register_collection_kernel.RegisterState,
  policy: register_collection_kernel.ReadPolicy,
) -> String {
  register_collection_kernel.read(state, "trail-status", policy)
  |> result.map(json_string_value)
  |> result.unwrap("")
}

fn collection_versions(
  state: register_collection_kernel.RegisterState,
) -> List(String) {
  register_collection_kernel.read_versions(state, "trail-status")
  |> result.map(fn(values) { list.map(values, json_string_value) })
  |> result.unwrap([])
}

fn visible_value(value: String) -> List(String) {
  case value {
    "" -> []
    value -> [value]
  }
}

pub fn register_demo_snapshot(room: RegisterDemoRoom) -> RegisterDemoSnapshot {
  case room {
    LwwRegisterRoom(a, b, c, pending) -> {
      let assert Ok(#(timestamp, author)) =
        a
        |> lww_register_kernel.summary
        |> json.to_string
        |> json.parse(
          decode.at(["state"], {
            use timestamp <- decode.field("timestamp", decode.int)
            use author <- decode.field("replica_id", decode.string)
            decode.success(#(timestamp, author))
          }),
        )
      RegisterDemoSnapshot(
        visible_value(lww_register_kernel.value(a)),
        visible_value(lww_register_kernel.value(b)),
        visible_value(lww_register_kernel.value(c)),
        list.length(pending),
        timestamp,
        author,
        timestamp,
        "",
        "",
        [lww_register_kernel.value(a)],
      )
    }
    MvRegisterRoom(a, b, c, pending) ->
      RegisterDemoSnapshot(
        mv_register_kernel.values(a),
        mv_register_kernel.values(b),
        mv_register_kernel.values(c),
        list.length(pending),
        0,
        "",
        0,
        "",
        "",
        [],
      )
    RegisterMapRoom(a, b, c, pending, sequence_number) ->
      RegisterDemoSnapshot(
        visible_value(collection_value(a, register_collection_kernel.Atomic)),
        visible_value(collection_value(b, register_collection_kernel.Atomic)),
        visible_value(collection_value(c, register_collection_kernel.Atomic)),
        list.length(pending),
        sequence_number,
        "",
        0,
        collection_value(a, register_collection_kernel.Atomic),
        collection_value(a, register_collection_kernel.Lww),
        collection_versions(a),
      )
  }
}

pub fn mv_write(register: Register, value: String) -> #(Register, Register) {
  let Register(state) = register
  let #(next, _, mv_register_kernel.Set(_, delta)) =
    mv_register_kernel.p2p_set(state, value)
  #(
    Register(next),
    Register(mv_register_kernel.from_sequenced(delta, state.replica_id)),
  )
}

pub fn mv_merge(register: Register, remote: Register) -> Register {
  let Register(state) = register
  let Register(remote) = remote
  Register(mv_register_kernel.p2p_merge(state, remote.sequenced).0)
}

pub fn mv_values(register: Register) -> List(String) {
  let Register(state) = register
  mv_register_kernel.values(state)
}

pub fn mv_restore(
  source: String,
  replica: String,
) -> Result(Register, json.DecodeError) {
  mv_register_kernel.from_summary(source, replica_id.new(replica))
  |> result.map(Register)
}

pub fn new_set(replica: String) -> ObservedSet {
  ObservedSet(or_set_kernel.new(replica_id.new(replica)))
}

pub fn set_add(set: ObservedSet, value: String) -> #(ObservedSet, ObservedSet) {
  let ObservedSet(state) = set
  let #(next, _, operation) = or_set_kernel.p2p_add(state, value)
  #(
    ObservedSet(next),
    ObservedSet(or_set_kernel.from_sequenced(operation.delta, state.replica_id)),
  )
}

pub fn set_remove(
  set: ObservedSet,
  value: String,
) -> #(ObservedSet, ObservedSet) {
  let ObservedSet(state) = set
  let #(next, _, operation) = or_set_kernel.p2p_remove(state, value)
  #(
    ObservedSet(next),
    ObservedSet(or_set_kernel.from_sequenced(operation.delta, state.replica_id)),
  )
}

pub fn set_merge(set: ObservedSet, remote: ObservedSet) -> ObservedSet {
  let ObservedSet(state) = set
  let ObservedSet(remote) = remote
  ObservedSet(or_set_kernel.p2p_merge(state, remote.sequenced).0)
}

pub fn set_values(set: ObservedSet) -> List(String) {
  let ObservedSet(state) = set
  or_set_kernel.values(state)
}

pub fn set_restore(
  source: String,
  replica: String,
) -> Result(ObservedSet, json.DecodeError) {
  or_set_kernel.from_summary(source, replica_id.new(replica))
  |> result.map(ObservedSet)
}

fn tag_decoder() -> decode.Decoder(Tag) {
  use replica <- decode.field("r", decode.string)
  use counter <- decode.field("c", decode.int)
  decode.success(Tag(replica, counter))
}

pub fn mv_snapshot(register: Register) -> MvSnapshot {
  let Register(state) = register
  let decoder = {
    use snapshot <- decode.field("state", {
      use entries <- decode.field(
        "entries",
        decode.list({
          use tag <- decode.field("tag", tag_decoder())
          use value <- decode.field("value", decode.string)
          decode.success(MvEntry(tag, value))
        }),
      )
      use clock <- decode.field(
        "vclock",
        decode.dict(decode.string, decode.int),
      )
      decode.success(MvSnapshot(
        entries,
        dict.to_list(clock) |> list.map(fn(entry) { Tag(entry.0, entry.1) }),
      ))
    })
    decode.success(snapshot)
  }
  // Decode the public kernel's own summary, never a caller's unchecked data.
  let assert Ok(snapshot) =
    state |> mv_register_kernel.summary |> json.to_string |> json.parse(decoder)
  snapshot
}

pub fn set_snapshot(set: ObservedSet) -> SetSnapshot {
  let ObservedSet(state) = set
  let decoder = {
    use snapshot <- decode.field("state", {
      use counter <- decode.field("counter", decode.int)
      use entries <- decode.field(
        "entries",
        decode.dict(decode.string, decode.list(tag_decoder())),
      )
      use tombstones <- decode.field("tombstones", decode.list(tag_decoder()))
      decode.success(SetSnapshot(
        counter,
        dict.to_list(entries)
          |> list.map(fn(entry) { SetEntry(entry.0, entry.1) }),
        tombstones,
      ))
    })
    decode.success(snapshot)
  }
  let assert Ok(snapshot) =
    state |> or_set_kernel.summary |> json.to_string |> json.parse(decoder)
  snapshot
}
