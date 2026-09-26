import atlas_remaining_structures as demos
import gleam/list
import gleeunit/should

pub fn remaining_structure_rooms_derive_all_views_from_kernel_operations_test() {
  let cases = [
    #(
      "shared-sequence",
      ["Bridge", "Weir", "North gate"],
      ["Bridge", "Falls", "Marsh", "Weir", "North gate"],
    ),
    #(
      "shared-text",
      ["The weir is clear."],
      ["The still calm weir is clear."],
    ),
    #("claims", ["gate-key: unclaimed"], ["gate-key: Alice"]),
    #(
      "task-manager",
      ["dispatcher: unassigned"],
      ["dispatcher: Alice", "waiting: Bob, Carol"],
    ),
    #(
      "pact-map",
      ["closure-target: absent"],
      ["closure-target: ridge-pass", "accepted by A, B, C"],
    ),
    #("json-ot", ["{}"], ["{\"revision\":1,\"title\":\"field notes\"}"]),
    #(
      "shared-rich-text",
      ["Hello World"],
      ["Hello [bold] World ▲"],
    ),
  ]

  list.each(cases, fn(example) {
    let #(kind, initial, expected) = example
    let assert Ok(room) = demos.new_remaining_demo(kind)
    let assert Ok(created) = demos.remaining_demo_snapshot(room)
    created.a |> should.equal(initial)
    created.b |> should.equal(initial)
    created.c |> should.equal(initial)

    let assert Ok(room) = demos.remaining_demo_stage_race(room)
    let assert Ok(staged) = demos.remaining_demo_snapshot(room)
    let has_pending = staged.pending > 0
    has_pending |> should.be_true
    [staged.a, staged.b, staged.c]
    |> should.not_equal([expected, expected, expected])

    let assert Ok(room) = demos.remaining_demo_deliver(room)
    let assert Ok(delivered) = demos.remaining_demo_snapshot(room)
    delivered.a |> should.equal(expected)
    delivered.b |> should.equal(expected)
    delivered.c |> should.equal(expected)
    delivered.pending |> should.equal(0)

    let assert Ok(reset) = demos.new_remaining_demo(kind)
    let assert Ok(reset) = demos.remaining_demo_snapshot(reset)
    reset.a |> should.equal(initial)
    reset.b |> should.equal(initial)
    reset.c |> should.equal(initial)
  })
}

pub fn fifo_work_queue_releases_to_tail_and_completes_test() {
  let assert Ok(room) = demos.new_remaining_demo("fifo-work-queue")
  let assert Ok(room) = demos.remaining_demo_ordered_acquire(room, "A")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(room) = demos.remaining_demo_ordered_acquire(room, "B")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(room) = demos.remaining_demo_ordered_release(room, "A")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(room) = demos.remaining_demo_ordered_acquire(room, "C")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(room) = demos.remaining_demo_ordered_complete(room, "B")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(snapshot) = demos.remaining_demo_snapshot(room)

  snapshot.a
  |> should.equal(["Carol owns restock first-aid cache", "Queue: inspect bridge"])
  snapshot.b |> should.equal(snapshot.a)
  snapshot.c |> should.equal(snapshot.a)
  snapshot.sequence_number |> should.equal(5)
}
