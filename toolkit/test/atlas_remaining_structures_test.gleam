import atlas_remaining_structures as demos
import gleam/list
import gleeunit/should

pub fn remaining_structure_rooms_derive_all_views_from_kernel_operations_test() {
  let cases = [
    #(
      "sequence-crdt",
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
      "json-ot",
      [
        "{\"crew\":[\"Ada\",\"Ben\"],\"gauge\":{\"stage\":24,\"trend\":\"steady\"},\"site\":\"Mill Race\"}",
      ],
      [
        "{\"crew\":[\"Cy\",\"Dot\",\"Ada\",\"Ben\"],\"gauge\":{\"stage\":25,\"trend\":\"steady\"},\"site\":\"Mill Race\"}",
      ],
    ),
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

pub fn pact_map_keeps_accepted_value_until_signoffs_clear_test() {
  let assert Ok(room) = demos.new_remaining_demo("pact-map")
  let assert Ok(room) =
    demos.remaining_demo_pact_propose(room, "A", "ridge-pass")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(pending) = demos.remaining_demo_snapshot(room)
  pending.a
  |> should.equal([
    "accepted: north-gate",
    "pending: ridge-pass",
    "needs signoff: Alice, Bob, Carol",
  ])

  let assert Ok(room) = demos.remaining_demo_pact_accept(room, "A")
  let assert Ok(room) = demos.remaining_demo_pact_accept(room, "B")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(partial) = demos.remaining_demo_snapshot(room)
  partial.a
  |> should.equal([
    "accepted: north-gate",
    "pending: ridge-pass",
    "needs signoff: Carol",
  ])

  let assert Ok(room) = demos.remaining_demo_pact_disconnect(room, "C")
  let assert Ok(accepted) = demos.remaining_demo_snapshot(room)
  accepted.a |> should.equal(["accepted: ridge-pass"])
  accepted.b |> should.equal(accepted.a)
  accepted.c |> should.equal(accepted.a)
  accepted.sequence_number |> should.equal(4)
}

pub fn task_manager_promotes_and_completes_test() {
  let assert Ok(room) = demos.new_remaining_demo("task-manager")
  let assert Ok(room) = demos.remaining_demo_task_volunteer(room, "A")
  let assert Ok(room) = demos.remaining_demo_task_volunteer(room, "B")
  let assert Ok(room) = demos.remaining_demo_task_volunteer(room, "C")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(queued) = demos.remaining_demo_snapshot(room)
  queued.a
  |> should.equal(["dispatcher: Alice", "waiting: Bob, Carol"])

  let assert Ok(room) = demos.remaining_demo_task_disconnect(room, "A")
  let assert Ok(promoted) = demos.remaining_demo_snapshot(room)
  promoted.a |> should.equal(["dispatcher: Bob", "waiting: Carol"])

  let assert Ok(room) = demos.remaining_demo_task_abandon(room, "C")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(waiting_left) = demos.remaining_demo_snapshot(room)
  waiting_left.a |> should.equal(["dispatcher: Bob"])

  let assert Ok(room) = demos.remaining_demo_task_complete(room, "B")
  let assert Ok(room) = demos.remaining_demo_deliver(room)
  let assert Ok(completed) = demos.remaining_demo_snapshot(room)
  completed.a |> should.equal(["dispatcher: unassigned"])
  completed.b |> should.equal(completed.a)
  completed.c |> should.equal(completed.a)
  completed.sequence_number |> should.equal(5)
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
