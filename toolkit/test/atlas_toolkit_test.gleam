import atlas_sluice as sluice
import atlas_toolkit as toolkit
import gleam/list
import gleam/string
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
  |> should.equal(
    toolkit.GCounterSnapshot(10, [
      toolkit.CounterEntry("A", 7),
      toolkit.CounterEntry("B", 3),
    ]),
  )
  toolkit.gcounter_snapshot(b)
  |> should.equal(
    toolkit.GCounterSnapshot(10, [
      toolkit.CounterEntry("A", 7),
      toolkit.CounterEntry("B", 3),
    ]),
  )
  toolkit.gcounter_merge(a, b_delta) |> should.equal(a)
}

pub fn gcounter_rejects_negative_increment_test() {
  toolkit.new_gcounter("A")
  |> toolkit.gcounter_increment(-1)
  |> should.be_error
}

pub fn pncounter_mixed_sign_updates_converge_and_replay_test() {
  let #(a, a_delta) = toolkit.new_pncounter("A") |> toolkit.pncounter_update(3)
  let #(b, b_delta) = toolkit.new_pncounter("B") |> toolkit.pncounter_update(-1)
  let a = toolkit.pncounter_merge(a, b_delta)
  let b = toolkit.pncounter_merge(b, a_delta)
  let expected =
    toolkit.PnCounterSnapshot(2, [toolkit.CounterEntry("A", 3)], [
      toolkit.CounterEntry("B", 1),
    ])
  toolkit.pncounter_snapshot(a) |> should.equal(expected)
  toolkit.pncounter_snapshot(b) |> should.equal(expected)
  toolkit.pncounter_merge(a, b_delta) |> should.equal(a)
}

pub fn pncounter_can_have_a_negative_visible_value_test() {
  let #(counter, _) = toolkit.new_pncounter("A") |> toolkit.pncounter_update(-3)
  toolkit.pncounter_snapshot(counter)
  |> should.equal(
    toolkit.PnCounterSnapshot(-3, [], [toolkit.CounterEntry("A", 3)]),
  )
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

pub fn pncounter_sluice_room_delivers_mixed_sign_updates_test() {
  let assert Ok(room) = sluice.new_pncounter_room()
  let assert Ok(initial) = sluice.pncounter_room_snapshot(room)
  initial.a |> should.equal(10)
  initial.b |> should.equal(10)
  initial.c |> should.equal(10)

  let assert Ok(room) = sluice.pncounter_room_stage_race(room)
  let assert Ok(staged) = sluice.pncounter_room_snapshot(room)
  staged.a |> should.equal(13)
  staged.b |> should.equal(9)
  staged.c |> should.equal(10)
  staged.pending |> should.be_true

  let #(room, deliveries) = sluice.pncounter_room_deliver(room)
  let assert Ok(delivered) = sluice.pncounter_room_snapshot(room)
  delivered.a |> should.equal(12)
  delivered.b |> should.equal(12)
  delivered.c |> should.equal(12)
  delivered.pending |> should.be_false
  deliveries |> should.not_equal([])
}

pub fn pncounter_sluice_room_accepts_direct_signed_update_test() {
  let assert Ok(room) = sluice.new_pncounter_room()
  let assert Ok(room) = sluice.pncounter_room_update(room, "C", -3)
  let assert Ok(local) = sluice.pncounter_room_snapshot(room)
  local.a |> should.equal(10)
  local.b |> should.equal(10)
  local.c |> should.equal(7)
  local.pending |> should.be_true

  let #(room, _) = sluice.pncounter_room_deliver(room)
  let assert Ok(delivered) = sluice.pncounter_room_snapshot(room)
  delivered.a |> should.equal(7)
  delivered.b |> should.equal(7)
  delivered.c |> should.equal(7)
}

pub fn sharedcounter_sluice_room_sequences_signed_updates_test() {
  let assert Ok(room) = sluice.new_sharedcounter_room()
  let assert Ok(initial) = sluice.sharedcounter_room_snapshot(room)
  initial.a |> should.equal(10)
  initial.b |> should.equal(10)
  initial.c |> should.equal(10)

  let assert Ok(room) = sluice.sharedcounter_room_stage_race(room)
  let assert Ok(staged) = sluice.sharedcounter_room_snapshot(room)
  staged.a |> should.equal(13)
  staged.b |> should.equal(9)
  staged.c |> should.equal(10)
  staged.pending |> should.be_true

  let #(room, first) = sluice.sharedcounter_room_deliver_one(room)
  let assert Ok(partial) = sluice.sharedcounter_room_snapshot(room)
  partial.pending |> should.be_true
  first |> list.length |> should.equal(3)

  let #(room, second) = sluice.sharedcounter_room_deliver_one(room)
  let assert Ok(delivered) = sluice.sharedcounter_room_snapshot(room)
  delivered.a |> should.equal(12)
  delivered.b |> should.equal(12)
  delivered.c |> should.equal(12)
  delivered.pending |> should.be_false
  second |> list.length |> should.equal(3)

  let #(room, repeated) = sluice.sharedcounter_room_deliver(room)
  let assert Ok(unchanged) = sluice.sharedcounter_room_snapshot(room)
  unchanged |> should.equal(delivered)
  repeated |> should.equal([])
}

pub fn sharedcounter_sluice_room_accepts_all_clients_test() {
  let assert Ok(room) = sluice.new_sharedcounter_room()
  let assert Ok(room) = sluice.sharedcounter_room_update(room, "A", 1)
  let assert Ok(room) = sluice.sharedcounter_room_update(room, "B", -3)
  let assert Ok(room) = sluice.sharedcounter_room_update(room, "C", 3)
  let #(room, deliveries) = sluice.sharedcounter_room_deliver(room)
  let assert Ok(delivered) = sluice.sharedcounter_room_snapshot(room)
  delivered.a |> should.equal(11)
  delivered.b |> should.equal(11)
  delivered.c |> should.equal(11)
  deliveries |> list.length |> should.equal(9)
}

pub fn set_sluice_rooms_show_each_conflict_rule_test() {
  let assert Ok(gset) = sluice.new_set_room("g-set")
  let assert Ok(gset) = sluice.set_room_stage_race(gset)
  let #(gset, _) = sluice.set_room_deliver(gset)
  let gset_view = sluice.set_room_snapshot(gset)
  gset_view.a |> list.sort(string.compare) |> should.equal(["Eagle Creek", "Ridge Pass"])
  gset_view.b |> list.sort(string.compare) |> should.equal(["Eagle Creek", "Ridge Pass"])
  gset_view.c |> list.sort(string.compare) |> should.equal(["Eagle Creek", "Ridge Pass"])

  let assert Ok(two_p) = sluice.new_set_room("two-p-set")
  let assert Ok(two_p) = sluice.set_room_stage_race(two_p)
  let #(two_p, _) = sluice.set_room_deliver(two_p)
  let two_p_view = sluice.set_room_snapshot(two_p)
  two_p_view.a |> should.equal([])
  two_p_view.b |> should.equal([])
  two_p_view.c |> should.equal([])

  let assert Ok(or_set) = sluice.new_set_room("or-set")
  let assert Ok(or_set) = sluice.set_room_stage_race(or_set)
  let #(or_set, _) = sluice.set_room_deliver(or_set)
  let or_set_view = sluice.set_room_snapshot(or_set)
  or_set_view.a |> should.equal(["Eagle Creek"])
  or_set_view.b |> should.equal(["Eagle Creek"])
  or_set_view.c |> should.equal(["Eagle Creek"])
}

pub fn gcounter_sluice_room_delivers_one_operation_at_a_time_test() {
  let assert Ok(room) = sluice.new_gcounter_room()
  let assert Ok(room) = sluice.gcounter_room_stage_race(room)

  let #(room, first) = sluice.gcounter_room_deliver_one(room)
  let assert Ok(partial) = sluice.gcounter_room_snapshot(room)
  partial.pending |> should.be_true
  first |> list.length |> should.equal(3)

  let #(room, second) = sluice.gcounter_room_deliver_one(room)
  let assert Ok(delivered) = sluice.gcounter_room_snapshot(room)
  delivered.a |> should.equal(10)
  delivered.b |> should.equal(10)
  delivered.c |> should.equal(10)
  delivered.pending |> should.be_false
  second |> list.length |> should.equal(3)
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
