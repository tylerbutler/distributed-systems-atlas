import atlas_toolkit as toolkit
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
