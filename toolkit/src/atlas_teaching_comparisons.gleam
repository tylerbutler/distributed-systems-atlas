import gleam/dynamic/decode
import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import lattice_core/replica_id
import watershed/lww_map_kernel as fields
import watershed/rich_text
import watershed/rich_text/operation_iterator
import watershed/rich_text_kernel as ot
import watershed/sequence_kernel as order
import watershed/text_kernel as crdt

type RecordClient {
  RecordClient(
    id: String,
    sequence: order.SequenceState,
    map: fields.LwwMapState,
  )
}

pub opaque type MoveComparison {
  MoveComparison(
    clients: List(RecordClient),
    move: Option(order.SequenceOperation),
    edit: Option(fields.LwwMapOperation),
    phase: String,
    evidence: List(String),
  )
}

type TextClient {
  TextClient(id: String, crdt: crdt.TextState, ot: ot.RichTextState)
}

type TextEdit {
  TextEdit(
    author: String,
    crdt: crdt.TextOperation,
    ot: ot.RichTextWireOperation,
  )
}

pub opaque type TextComparison {
  TextComparison(
    clients: List(TextClient),
    edits: List(TextEdit),
    phase: String,
    evidence: List(String),
  )
}

pub fn new_move() -> Result(MoveComparison, String) {
  use initial <- result.try(
    list.try_fold(
      ["bridge", "weir", "north-gate"],
      #(order.new(replica_id.new("A")), fields.new(replica_id.new("A"))),
      fn(states, id) {
        use inserted <- result.try(
          order.p2p_insert(states.0, order.length(states.0), json.string(id))
          |> result.map_error(string.inspect),
        )
        use set <- result.try(
          fields.p2p_set(states.1, id, "open", 1)
          |> result.map_error(string.inspect),
        )
        Ok(#(inserted.0, set.0))
      },
    ),
  )
  let sequence_summary = initial.0 |> order.summary |> json.to_string
  let map_summary = initial.1 |> fields.summary |> json.to_string
  use clients <- result.try(
    list.try_map(["A", "B", "C"], fn(id) {
      use sequence <- result.try(
        order.from_summary(sequence_summary, replica_id.new(id))
        |> result.map_error(string.inspect),
      )
      use map <- result.try(
        fields.from_summary(map_summary, replica_id.new(id))
        |> result.map_error(string.inspect),
      )
      Ok(RecordClient(id, sequence, map))
    }),
  )
  Ok(
    MoveComparison(clients, None, None, "ready", [
      "Shared SequenceCrdt summary: " <> sequence_summary,
      "Shared LWW-map summary: " <> map_summary,
    ]),
  )
}

pub fn stage_move(room: MoveComparison) -> Result(MoveComparison, String) {
  case room.phase {
    "ready" -> {
      let assert [alice, bob, carol] = room.clients
      use moved <- result.try(
        order.p2p_move(alice.sequence, 1, 0)
        |> result.map_error(string.inspect),
      )
      use edited <- result.try(
        fields.p2p_set(bob.map, "weir", "blocked", 2)
        |> result.map_error(string.inspect),
      )
      Ok(MoveComparison(
        [
          RecordClient(..alice, sequence: moved.0),
          RecordClient(..bob, map: edited.0),
          carol,
        ],
        Some(moved.2),
        Some(edited.2),
        "staged",
        list.append(room.evidence, [
          "Alice p2p_move(1, 0), native operation: " <> string.inspect(moved.2),
          "SequenceCrdt summary after move (same item identity): "
            <> { moved.0 |> order.summary |> json.to_string },
          "Bob p2p_set(weir, blocked, 2): " <> string.inspect(edited.2),
        ]),
      ))
    }
    _ -> Error("Stage requires a reset comparison.")
  }
}

pub fn deliver_move(
  room: MoveComparison,
  reverse: Bool,
) -> Result(MoveComparison, String) {
  case room.phase, room.move, room.edit {
    "staged", Some(move), Some(edit) -> {
      use clients <- result.try(
        list.try_map(room.clients, fn(client) {
          case reverse {
            True -> {
              use map <- result.try(
                fields.apply_remote(client.map, edit)
                |> result.map_error(string.inspect),
              )
              Ok(
                RecordClient(
                  ..client,
                  map: map.0,
                  sequence: order.apply_remote(client.sequence, move).0,
                ),
              )
            }
            False -> {
              let sequence = order.apply_remote(client.sequence, move).0
              use map <- result.try(
                fields.apply_remote(client.map, edit)
                |> result.map_error(string.inspect),
              )
              Ok(RecordClient(..client, sequence: sequence, map: map.0))
            }
          }
        }),
      )
      Ok(MoveComparison(..room, clients: clients, phase: "delivered"))
    }
    _, _, _ -> Error("Deliver requires staged operations.")
  }
}

pub fn move_snapshot(room: MoveComparison) -> String {
  json.object([
    #("phase", json.string(room.phase)),
    #("evidence", json.array(room.evidence, json.string)),
    #(
      "clients",
      json.array(room.clients, fn(client) {
        json.object([
          #("id", json.string(client.id)),
          #(
            "records",
            json.array(order.values(client.sequence), fn(value) {
              let assert Ok(id) =
                json.parse(json.to_string(value), decode.string)
              let assert Ok(field) = fields.get(client.map, id)
              json.object([
                #("id", json.string(id)),
                #("value", json.string(field)),
              ])
            }),
          ),
        ])
      }),
    ),
  ])
  |> json.to_string
}

pub fn new_text() -> Result(TextComparison, String) {
  let initial = "The weir is clear."
  let #(state, _, submission) =
    crdt.append(crdt.new(replica_id.new("A")), initial)
  let assert Some(crdt.Submission(operation, _)) = submission
  use state <- result.try(
    crdt.ack_local(state, operation) |> result.map_error(string.inspect),
  )
  let summary = state |> crdt.summary |> json.to_string
  use document <- result.try(
    rich_text.document_insert_text(
      rich_text.empty_document(),
      initial,
      rich_text.attributes([]),
    )
    |> result.map_error(string.inspect),
  )
  use clients <- result.try(
    list.try_map(["A", "B", "C"], fn(id) {
      use state <- result.try(
        crdt.from_summary(summary, replica_id.new(id))
        |> result.map_error(string.inspect),
      )
      Ok(TextClient(id, state, ot.from_document(document)))
    }),
  )
  Ok(
    TextComparison(clients, [], "ready", [
      "Shared TextCrdt summary: " <> summary,
      "Shared RichTextOt document: "
        <> { document |> rich_text.document_to_json |> json.to_string },
    ]),
  )
}

pub fn stage_text(room: TextComparison) -> Result(TextComparison, String) {
  case room.phase {
    "ready" -> {
      use staged <- result.try(
        list.try_map(room.clients, fn(client) {
          case client.id {
            "C" -> Ok(#(client, None))
            _ -> {
              let inserted = case client.id {
                "A" -> "still "
                _ -> "calm "
              }
              use update <- result.try(
                crdt.insert(client.crdt, 4, inserted)
                |> result.map_error(string.inspect),
              )
              let assert Some(crdt.Submission(operation, _)) = update.2
              use delta <- result.try(
                rich_text.delta_retain(
                  rich_text.empty_delta(),
                  4,
                  rich_text.attributes([]),
                )
                |> result.map_error(string.inspect),
              )
              use delta <- result.try(
                rich_text.delta_insert_text(
                  delta,
                  inserted,
                  rich_text.attributes([]),
                )
                |> result.map_error(string.inspect),
              )
              use submitted <- result.try(
                ot.submit(client.ot, delta, 0)
                |> result.map_error(string.inspect),
              )
              let assert Some(wire) = submitted.1
              Ok(#(
                TextClient(client.id, update.0, submitted.0),
                Some(TextEdit(client.id, operation, wire)),
              ))
            }
          }
        }),
      )
      let edits =
        list.filter_map(staged, fn(pair) {
          case pair.1 {
            Some(edit) -> Ok(edit)
            None -> Error(Nil)
          }
        })
      let evidence =
        list.flat_map(edits, fn(edit) {
          [
            edit.author
              <> " TextCrdt native operation (index, value, grapheme identities/delta): "
              <> string.inspect(edit.crdt),
            edit.author
              <> " RichTextOt reference="
              <> string.inspect(edit.ot.reference_sequence_number)
              <> " delta="
              <> { edit.ot.delta |> rich_text.delta_to_json |> json.to_string },
          ]
        })
      Ok(TextComparison(
        list.map(staged, fn(pair) { pair.0 }),
        edits,
        "staged",
        list.append(room.evidence, evidence),
      ))
    }
    _ -> Error("Stage requires a reset comparison.")
  }
}

fn apply_text_edit(
  client: TextClient,
  edit: TextEdit,
  sequence_number: Int,
) -> Result(TextClient, String) {
  use crdt_state <- result.try(
    case client.id == edit.author {
      True -> crdt.ack_local(client.crdt, edit.crdt)
      False -> Ok(crdt.apply_remote(client.crdt, edit.crdt).0)
    }
    |> result.map_error(string.inspect),
  )
  use ot_state <- result.try(
    case client.id == edit.author {
      True -> ot.ack_local(client.ot, edit.ot, sequence_number, 0)
      False -> ot.apply_remote(client.ot, edit.ot, sequence_number, 0)
    }
    |> result.map_error(string.inspect),
  )
  Ok(TextClient(client.id, crdt_state, ot_state.0))
}

pub fn deliver_text(
  room: TextComparison,
  reverse: Bool,
) -> Result(TextComparison, String) {
  case room.phase {
    "staged" -> {
      let edits = case reverse {
        True -> list.reverse(room.edits)
        False -> room.edits
      }
      use delivered <- result.try(
        list.try_fold(edits, #(room.clients, 0), fn(states, edit) {
          let number = states.1 + 1
          use clients <- result.try(
            list.try_map(states.0, fn(client) {
              apply_text_edit(client, edit, number)
            }),
          )
          Ok(#(clients, number))
        }),
      )
      let assert [first, second] = edits
      let assert [_, _, carol] = delivered.0
      let assert [_, transformed] = carol.ot.log
      Ok(
        TextComparison(
          ..room,
          clients: delivered.0,
          phase: "delivered",
          evidence: list.append(room.evidence, [
            "Sequencer: "
              <> first.author
              <> " #1, "
              <> second.author
              <> " #2; both authored at reference 0.",
            second.author
              <> " transformed against #1 at head reference 1: "
              <> {
              transformed.operation |> rich_text.delta_to_json |> json.to_string
            },
          ]),
        ),
      )
    }
    _ -> Error("Deliver requires staged operations.")
  }
}

pub fn text_snapshot(room: TextComparison) -> Result(String, String) {
  use clients <- result.try(
    list.try_map(room.clients, fn(client) {
      use document <- result.try(
        ot.view(client.ot) |> result.map_error(string.inspect),
      )
      let plain =
        rich_text.document_to_operations(document)
        |> list.fold("", fn(value, operation) {
          case operation {
            operation_iterator.InsertText(inserted, _) -> value <> inserted
            _ -> value
          }
        })
      Ok(
        json.object([
          #("id", json.string(client.id)),
          #("crdt", json.string(crdt.value(client.crdt))),
          #("ot", json.string(plain)),
        ]),
      )
    }),
  )
  Ok(
    json.object([
      #("phase", json.string(room.phase)),
      #("evidence", json.array(room.evidence, json.string)),
      #("clients", json.array(clients, fn(value) { value })),
    ])
    |> json.to_string,
  )
}
