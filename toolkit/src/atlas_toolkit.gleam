//// Pure, ack-free operations for Atlas and later Gleam examples.
//// The kernels own state transitions. Snapshot records expose metadata only.

import gleam/dict
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/result
import gleam/string
import lattice_core/replica_id
import watershed/g_counter_kernel
import watershed/mv_register_kernel
import watershed/or_set_kernel

pub opaque type Register {
  Register(state: mv_register_kernel.MvRegisterState)
}

pub opaque type ObservedSet {
  ObservedSet(state: or_set_kernel.OrSetState)
}

pub opaque type GrowOnlyCounter {
  GrowOnlyCounter(state: g_counter_kernel.GCounterState)
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

pub fn new_gcounter(replica: String) -> GrowOnlyCounter {
  GrowOnlyCounter(g_counter_kernel.new(replica_id.new(replica)))
}

pub fn gcounter_increment(
  counter: GrowOnlyCounter,
  amount: Int,
) -> Result(#(GrowOnlyCounter, GrowOnlyCounter), g_counter_kernel.EditError) {
  let GrowOnlyCounter(state) = counter
  use #(next, _, operation) <- result.try(
    g_counter_kernel.p2p_increment(state, amount),
  )
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
          |> list.sort(fn(a, b) {
            string.compare(a.replica_id, b.replica_id)
          }),
      ))
    })
    decode.success(snapshot)
  }
  let assert Ok(snapshot) =
    state |> g_counter_kernel.summary |> json.to_string |> json.parse(decoder)
  snapshot
}

pub fn new_mv(replica: String) -> Register {
  Register(mv_register_kernel.new(replica_id.new(replica)))
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
