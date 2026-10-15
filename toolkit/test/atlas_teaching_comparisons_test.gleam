import atlas_teaching_comparisons as comparisons
import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/string
import gleeunit/should

fn text_values(snapshot: String) {
  let client = {
    use crdt <- decode.field("crdt", decode.string)
    use ot <- decode.field("ot", decode.string)
    decode.success(#(crdt, ot))
  }
  let assert Ok(clients) =
    json.parse(snapshot, decode.at(["clients"], decode.list(client)))
  clients
}

pub fn matched_text_inputs_and_delivery_orders_test() {
  list.each([False, True], fn(reverse) {
    let assert Ok(room) = comparisons.new_text()
    let assert Ok(snapshot) = comparisons.text_snapshot(room)
    text_values(snapshot)
    |> should.equal(list.repeat(
      #("The weir is clear.", "The weir is clear."),
      3,
    ))
    let assert Ok(staged) = comparisons.stage_text(room)
    let assert Ok(snapshot) = comparisons.text_snapshot(staged)
    text_values(snapshot)
    |> should.equal([
      #("The still weir is clear.", "The still weir is clear."),
      #("The calm weir is clear.", "The calm weir is clear."),
      #("The weir is clear.", "The weir is clear."),
    ])
    let assert Ok(delivered) = comparisons.deliver_text(staged, reverse)
    let assert Ok(snapshot) = comparisons.text_snapshot(delivered)
    let expected_ot = case reverse {
      True -> "The calm still weir is clear."
      False -> "The still calm weir is clear."
    }
    text_values(snapshot)
    |> should.equal(list.repeat(
      #("The still calm weir is clear.", expected_ot),
      3,
    ))
    comparisons.stage_text(delivered) |> should.be_error
    comparisons.deliver_text(delivered, reverse) |> should.be_error
    let assert Ok(reset) = comparisons.new_text()
    comparisons.text_snapshot(reset)
    |> should.equal(comparisons.text_snapshot(room))
  })
}

pub fn move_and_field_target_are_independent_in_both_orders_test() {
  list.each([False, True], fn(reverse) {
    let assert Ok(room) = comparisons.new_move()
    comparisons.deliver_move(room, reverse) |> should.be_error
    let assert Ok(staged) = comparisons.stage_move(room)
    let assert Ok(delivered) = comparisons.deliver_move(staged, reverse)
    let record = {
      use id <- decode.field("id", decode.string)
      use value <- decode.field("value", decode.string)
      decode.success(#(id, value))
    }
    let assert Ok(clients) =
      json.parse(
        comparisons.move_snapshot(delivered),
        decode.at(
          ["clients"],
          decode.list(decode.at(["records"], decode.list(record))),
        ),
      )
    clients
    |> should.equal(list.repeat(
      [
        #("weir", "blocked"),
        #("bridge", "open"),
        #("north-gate", "open"),
      ],
      3,
    ))
    comparisons.move_snapshot(staged)
    |> string.contains("native operation: Move")
    |> should.be_true
    comparisons.stage_move(delivered) |> should.be_error
    let assert Ok(reset) = comparisons.new_move()
    comparisons.move_snapshot(reset)
    |> should.equal(comparisons.move_snapshot(room))
  })
}
