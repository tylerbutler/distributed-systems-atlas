import atlas_toolkit as toolkit
import atlas_sluice as sluice
import gleeunit
import gleeunit/should

pub fn main() {
  gleeunit.main()
}

pub fn register_siblings_and_resolution_test() {
  let #(a, red) = toolkit.new_mv("A") |> toolkit.mv_write("red")
  let #(b, blue) = toolkit.new_mv("B") |> toolkit.mv_write("blue")
  let joined = toolkit.mv_merge(a, blue)
  joined |> toolkit.mv_values |> should.equal(["blue", "red"])
  toolkit.mv_merge(b, red)
  |> toolkit.mv_values
  |> should.equal(["blue", "red"])
  let #(resolved, green) = toolkit.mv_write(joined, "green")
  resolved |> toolkit.mv_values |> should.equal(["green"])
  toolkit.mv_merge(b, green) |> toolkit.mv_values |> should.equal(["green"])
}

pub fn set_add_wins_and_stale_replay_test() {
  let #(a, original) = toolkit.new_set("A") |> toolkit.set_add("beacon")
  let b = toolkit.new_set("B") |> toolkit.set_merge(original)
  let #(a, removal) = toolkit.set_remove(a, "beacon")
  let #(b, concurrent) = toolkit.set_add(b, "beacon")
  let a = toolkit.set_merge(a, concurrent)
  let b = b |> toolkit.set_merge(removal) |> toolkit.set_merge(original)
  a |> toolkit.set_values |> should.equal(["beacon"])
  b |> toolkit.set_values |> should.equal(["beacon"])
  toolkit.set_snapshot(b).counter |> should.equal(2)
  toolkit.set_snapshot(b).tombstones
  |> should.equal([toolkit.Tag("A", 1)])
}

pub fn duplicate_merge_test() {
  let #(_, delta) = toolkit.new_mv("A") |> toolkit.mv_write("same")
  let once = toolkit.new_mv("B") |> toolkit.mv_merge(delta)
  toolkit.mv_merge(once, delta) |> should.equal(once)
  let #(_, delta) = toolkit.new_set("A") |> toolkit.set_add("same")
  let once = toolkit.new_set("B") |> toolkit.set_merge(delta)
  toolkit.set_merge(once, delta) |> should.equal(once)
}

pub fn gcounter_concurrent_increment_and_duplicate_merge_test() {
  let assert Ok(#(a, a_delta)) =
    toolkit.new_gcounter("A") |> toolkit.gcounter_increment(7)
  let assert Ok(#(b, b_delta)) =
    toolkit.new_gcounter("B") |> toolkit.gcounter_increment(3)
  let a = toolkit.gcounter_merge(a, b_delta)
  let b = toolkit.gcounter_merge(b, a_delta)
  toolkit.gcounter_snapshot(a)
  |> should.equal(toolkit.GCounterSnapshot(10, [
    toolkit.CounterEntry("A", 7),
    toolkit.CounterEntry("B", 3),
  ]))
  toolkit.gcounter_snapshot(b)
  |> should.equal(toolkit.GCounterSnapshot(10, [
    toolkit.CounterEntry("A", 7),
    toolkit.CounterEntry("B", 3),
  ]))
  toolkit.gcounter_merge(a, b_delta) |> should.equal(a)
}

pub fn gcounter_rejects_negative_increment_test() {
  toolkit.new_gcounter("A")
  |> toolkit.gcounter_increment(-1)
  |> should.be_error
}

pub fn gcounter_sluice_room_delivers_to_three_clients_test() {
  let assert Ok(room) = sluice.new_gcounter_room()
  let assert Ok(room) = sluice.gcounter_room_stage_race(room)
  let assert Ok(staged) = sluice.gcounter_room_snapshot(room)
  staged.a |> should.equal(7)
  staged.b |> should.equal(3)
  staged.c |> should.equal(0)
  staged.pending |> should.be_true

  let #(room, deliveries) = sluice.gcounter_room_deliver(room)
  let assert Ok(delivered) = sluice.gcounter_room_snapshot(room)
  delivered.a |> should.equal(10)
  delivered.b |> should.equal(10)
  delivered.c |> should.equal(10)
  delivered.pending |> should.be_false
  deliveries |> should.not_equal([])

  let assert Ok(#(room, replay)) = sluice.gcounter_room_resend(room, "B")
  let assert Ok(replayed) = sluice.gcounter_room_snapshot(room)
  replayed.a |> should.equal(10)
  replayed.b |> should.equal(10)
  replayed.c |> should.equal(10)
  replay |> should.not_equal([])
}

pub fn gcounter_sluice_room_accepts_direct_client_increment_test() {
  let assert Ok(room) = sluice.new_gcounter_room()
  let assert Ok(room) = sluice.gcounter_room_increment(room, "C", 3)
  let assert Ok(local) = sluice.gcounter_room_snapshot(room)
  local.a |> should.equal(0)
  local.b |> should.equal(0)
  local.c |> should.equal(3)
  local.pending |> should.be_true

  let #(room, _) = sluice.gcounter_room_deliver(room)
  let assert Ok(delivered) = sluice.gcounter_room_snapshot(room)
  delivered.a |> should.equal(3)
  delivered.b |> should.equal(3)
  delivered.c |> should.equal(3)
}

pub fn equal_siblings_and_unobserved_write_test() {
  let #(a, _) = toolkit.new_mv("A") |> toolkit.mv_write("same")
  let #(_, b) = toolkit.new_mv("B") |> toolkit.mv_write("same")
  let #(_, c) = toolkit.new_mv("C") |> toolkit.mv_write("unseen")
  let a = toolkit.mv_merge(a, b)
  a |> toolkit.mv_values |> should.equal(["same", "same"])
  let #(a, _) = toolkit.mv_write(a, "resolved")
  toolkit.mv_merge(a, c)
  |> toolkit.mv_values
  |> should.equal(["resolved", "unseen"])
}

pub fn sparse_removal_metadata_test() {
  let #(a, _) = toolkit.new_set("A") |> toolkit.set_add("beacon")
  let #(a, _) = toolkit.set_add(a, "other")
  let #(_, removal) = toolkit.set_remove(a, "beacon")
  let snapshot = toolkit.set_snapshot(removal)
  snapshot.entries |> should.equal([])
  snapshot.tombstones |> should.equal([toolkit.Tag("A", 1)])
}

pub fn malformed_summary_test() {
  toolkit.mv_restore("not JSON", "A") |> should.be_error
  toolkit.set_restore("not JSON", "A") |> should.be_error
  toolkit.mv_restore("{\"type\":\"or_set\",\"v\":1,\"state\":{}}", "A")
  |> should.be_error
}
