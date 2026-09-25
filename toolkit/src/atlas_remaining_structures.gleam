import gleam/json
import gleam/list
import gleam/option.{type Option, None, Some}
import gleam/result
import gleam/string
import gleam/dynamic/decode
import lattice_core/replica_id
import watershed/claims_kernel
import watershed/json_ot
import watershed/json_ot_kernel
import watershed/ordered_collection_kernel
import watershed/pact_map_kernel
import watershed/rich_text
import watershed/rich_text/attribute_map
import watershed/rich_text/operation_iterator
import watershed/rich_text_kernel
import watershed/sequence_kernel
import watershed/task_manager_kernel
import watershed/text_kernel

pub type RemainingDemoSnapshot {
  RemainingDemoSnapshot(
    a: List(String),
    b: List(String),
    c: List(String),
    pending: Int,
    sequence_number: Int,
  )
}

type Authored(operation) {
  Authored(author: String, operation: operation)
}

type TaskOperation {
  TaskOperation(
    author: String,
    operation: task_manager_kernel.TaskManagerOperation,
    message_id: Int,
  )
}

pub opaque type RemainingDemoRoom {
  SequenceRoom(
    a: sequence_kernel.SequenceState,
    b: sequence_kernel.SequenceState,
    c: sequence_kernel.SequenceState,
    pending: List(Authored(sequence_kernel.SequenceOperation)),
    acted: List(String),
  )
  TextRoom(
    a: text_kernel.TextState,
    b: text_kernel.TextState,
    c: text_kernel.TextState,
    pending: List(Authored(text_kernel.TextOperation)),
    acted: List(String),
    sequence_number: Int,
  )
  ClaimsRoom(
    a: claims_kernel.ClaimsState,
    b: claims_kernel.ClaimsState,
    c: claims_kernel.ClaimsState,
    pending: List(Authored(claims_kernel.ClaimOperation)),
    acted: List(String),
    sequence_number: Int,
  )
  OrderedRoom(
    a: ordered_collection_kernel.OrderedState,
    b: ordered_collection_kernel.OrderedState,
    c: ordered_collection_kernel.OrderedState,
    pending: List(Authored(ordered_collection_kernel.OrderedOperation)),
    acted: List(String),
    sequence_number: Int,
  )
  TaskRoom(
    a: task_manager_kernel.TaskManagerState,
    b: task_manager_kernel.TaskManagerState,
    c: task_manager_kernel.TaskManagerState,
    pending: List(TaskOperation),
    acted: List(String),
    sequence_number: Int,
  )
  PactRoom(
    a: pact_map_kernel.PactMapState,
    b: pact_map_kernel.PactMapState,
    c: pact_map_kernel.PactMapState,
    proposal: Option(pact_map_kernel.PactMapOperation),
    signoffs: List(Int),
    acted: List(String),
    sequence_number: Int,
  )
  JsonOtRoom(
    a: json_ot_kernel.JsonOtState,
    b: json_ot_kernel.JsonOtState,
    c: json_ot_kernel.JsonOtState,
    pending: List(Authored(json_ot_kernel.JsonOtWireOperation)),
    acted: List(String),
    sequence_number: Int,
  )
  RichTextRoom(
    a: rich_text_kernel.RichTextState,
    b: rich_text_kernel.RichTextState,
    c: rich_text_kernel.RichTextState,
    pending: List(Authored(rich_text_kernel.RichTextWireOperation)),
    acted: List(String),
    sequence_number: Int,
  )
}

pub fn new_remaining_demo(kind: String) -> Result(RemainingDemoRoom, String) {
  case kind {
    "shared-sequence" -> new_sequence_room()
    "shared-text" -> new_text_room()
    "claims" ->
      Ok(ClaimsRoom(
        claims_kernel.new(),
        claims_kernel.new(),
        claims_kernel.new(),
        [],
        [],
        0,
      ))
    "fifo-work-queue" -> {
      let initial =
        ordered_collection_kernel.from_summary(
          [json.string("inspect bridge")],
          [],
        )
      Ok(OrderedRoom(initial, initial, initial, [], [], 0))
    }
    "task-manager" ->
      Ok(TaskRoom(
        task_manager_kernel.new(),
        task_manager_kernel.new(),
        task_manager_kernel.new(),
        [],
        [],
        0,
      ))
    "pact-map" ->
      Ok(PactRoom(
        pact_map_kernel.new(),
        pact_map_kernel.new(),
        pact_map_kernel.new(),
        None,
        [],
        [],
        0,
      ))
    "json-ot" ->
      Ok(JsonOtRoom(
        json_ot_kernel.new(),
        json_ot_kernel.new(),
        json_ot_kernel.new(),
        [],
        [],
        0,
      ))
    "shared-rich-text" -> new_rich_text_room()
    _ -> Error("unknown remaining structure demo")
  }
}

pub fn remaining_demo_stage_race(
  room: RemainingDemoRoom,
) -> Result(RemainingDemoRoom, String) {
  use room <- result.try(remaining_demo_act(room, "A"))
  use room <- result.try(remaining_demo_act(room, "B"))
  remaining_demo_act(room, "C")
}

pub fn remaining_demo_act(
  room: RemainingDemoRoom,
  replica: String,
) -> Result(RemainingDemoRoom, String) {
  use _ <- result.try(valid_replica(replica))
  case room {
    SequenceRoom(a, b, c, pending, acted) -> {
      use acted <- result.try(mark_acted(acted, replica))
      case replica {
        "A" ->
          remaining_demo_insert(
            SequenceRoom(a, b, c, pending, acted),
            "A",
            1,
            "Falls",
          )
        "B" ->
          remaining_demo_insert(
            SequenceRoom(a, b, c, pending, acted),
            "B",
            1,
            "Marsh",
          )
        _ -> Ok(SequenceRoom(a, b, c, pending, acted))
      }
    }
    TextRoom(a, b, c, pending, acted, sequence_number) -> {
      use acted <- result.try(mark_acted(acted, replica))
      case replica {
        "A" -> {
          use #(a, _, submission) <- result.try(
            text_kernel.insert(a, 4, "still ")
            |> result.map_error(fn(_) { "SharedText insertion failed" }),
          )
          let assert Some(text_kernel.Submission(operation, _)) = submission
          Ok(TextRoom(
            a,
            b,
            c,
            list.append(pending, [Authored("A", operation)]),
            acted,
            sequence_number,
          ))
        }
        "B" -> {
          use #(b, _, submission) <- result.try(
            text_kernel.insert(b, 4, "calm ")
            |> result.map_error(fn(_) { "SharedText insertion failed" }),
          )
          let assert Some(text_kernel.Submission(operation, _)) = submission
          Ok(TextRoom(
            a,
            b,
            c,
            list.append(pending, [Authored("B", operation)]),
            acted,
            sequence_number,
          ))
        }
        _ -> Ok(TextRoom(a, b, c, pending, acted, sequence_number))
      }
    }
    ClaimsRoom(a, b, c, pending, acted, sequence_number) -> {
      use acted <- result.try(mark_acted(acted, replica))
      let #(state, name) = case replica {
        "A" -> #(a, "Alice")
        "B" -> #(b, "Bob")
        _ -> #(c, "Carol")
      }
      use submitted <- result.try(
        claims_kernel.claim_once(
          state,
          "gate-key",
          json.string(name),
          sequence_number,
        )
        |> result.map_error(fn(_) { "Claims submission failed" }),
      )
      case submitted {
        claims_kernel.AlreadyClaimed(_) ->
          Error("gate-key already has a committed claimant")
        claims_kernel.Submitted(state, operation) -> {
          let #(a, b, c) = case replica {
            "A" -> #(state, b, c)
            "B" -> #(a, state, c)
            _ -> #(a, b, state)
          }
          Ok(ClaimsRoom(
            a,
            b,
            c,
            list.append(pending, [Authored(replica, operation)]),
            acted,
            sequence_number,
          ))
        }
      }
    }
    OrderedRoom(a, b, c, pending, acted, sequence_number) -> {
      use acted <- result.try(mark_acted(acted, replica))
      Ok(OrderedRoom(
        a,
        b,
        c,
        list.append(pending, [
          Authored(replica, ordered_collection_kernel.acquire(replica)),
        ]),
        acted,
        sequence_number,
      ))
    }
    TaskRoom(a, b, c, pending, acted, sequence_number) -> {
      use acted <- result.try(mark_acted(acted, replica))
      let self_id = replica_number(replica)
      let #(state, operation, _) = case replica {
        "A" -> task_manager_kernel.volunteer(a, "dispatcher", self_id, 0)
        "B" -> task_manager_kernel.volunteer(b, "dispatcher", self_id, 0)
        _ -> task_manager_kernel.volunteer(c, "dispatcher", self_id, 0)
      }
      let assert Some(operation) = operation
      let #(a, b, c) = case replica {
        "A" -> #(state, b, c)
        "B" -> #(a, state, c)
        _ -> #(a, b, state)
      }
      Ok(TaskRoom(
        a,
        b,
        c,
        list.append(pending, [TaskOperation(replica, operation, 0)]),
        acted,
        sequence_number,
      ))
    }
    PactRoom(a, b, c, proposal, signoffs, acted, sequence_number) -> {
      use acted <- result.try(mark_acted(acted, replica))
      case replica {
        "A" -> {
          use operation <- result.try(
            pact_map_kernel.set(
              a,
              "closure-target",
              Some(json.string("ridge-pass")),
              sequence_number,
            )
            |> result.map_error(fn(_) { "PactMap proposal failed" }),
          )
          Ok(PactRoom(
            a,
            b,
            c,
            Some(operation),
            list.append(signoffs, [1]),
            acted,
            sequence_number,
          ))
        }
        _ ->
          case proposal, pact_map_kernel.is_pending(a, "closure-target") {
            None, False -> Error("Alice must queue the proposal before signoff")
            _, _ ->
              Ok(PactRoom(
                a,
                b,
                c,
                proposal,
                list.append(signoffs, [replica_number(replica)]),
                acted,
                sequence_number,
              ))
          }
      }
    }
    JsonOtRoom(a, b, c, pending, acted, sequence_number) -> {
      use acted <- result.try(mark_acted(acted, replica))
      case replica {
        "A" -> {
          use #(a, wire, _) <- result.try(
            json_ot_kernel.submit(
              a,
              [
                json_ot.object_insert(
                  [json_ot.Key("title")],
                  json_ot.VString("field notes"),
                ),
              ],
              sequence_number,
            )
            |> result.map_error(fn(_) { "JsonOt submission failed" }),
          )
          let assert Some(wire) = wire
          Ok(JsonOtRoom(
            a,
            b,
            c,
            list.append(pending, [Authored("A", wire)]),
            acted,
            sequence_number,
          ))
        }
        "B" -> {
          use #(b, wire, _) <- result.try(
            json_ot_kernel.submit(
              b,
              [
                json_ot.object_insert(
                  [json_ot.Key("revision")],
                  json_ot.VNumber(json_ot.NInt(1)),
                ),
              ],
              sequence_number,
            )
            |> result.map_error(fn(_) { "JsonOt submission failed" }),
          )
          let assert Some(wire) = wire
          Ok(JsonOtRoom(
            a,
            b,
            c,
            list.append(pending, [Authored("B", wire)]),
            acted,
            sequence_number,
          ))
        }
        _ -> Ok(JsonOtRoom(a, b, c, pending, acted, sequence_number))
      }
    }
    RichTextRoom(a, b, c, pending, acted, sequence_number) -> {
      use acted <- result.try(mark_acted(acted, replica))
      case replica {
        "A" -> {
          let bold =
            rich_text.attributes([#("bold", json_ot.VBool(True))])
          use delta <- result.try(
            rich_text.delta_retain(rich_text.empty_delta(), 5, bold)
            |> result.map_error(fn(_) {
              "SharedRichText formatting failed"
            }),
          )
          use #(a, wire, _) <- result.try(
            rich_text_kernel.submit(a, delta, sequence_number)
            |> result.map_error(fn(_) {
              "SharedRichText submission failed"
            }),
          )
          let assert Some(wire) = wire
          Ok(RichTextRoom(
            a,
            b,
            c,
            list.append(pending, [Authored("A", wire)]),
            acted,
            sequence_number,
          ))
        }
        "B" -> {
          use delta <- result.try(
            rich_text.delta_retain(
              rich_text.empty_delta(),
              11,
              rich_text.attributes([]),
            )
            |> result.map_error(fn(_) { "SharedRichText retain failed" }),
          )
          use delta <- result.try(
            rich_text.delta_insert_text(
              delta,
              " ▲",
              rich_text.attributes([]),
            )
            |> result.map_error(fn(_) {
              "SharedRichText insertion failed"
            }),
          )
          use #(b, wire, _) <- result.try(
            rich_text_kernel.submit(b, delta, sequence_number)
            |> result.map_error(fn(_) {
              "SharedRichText submission failed"
            }),
          )
          let assert Some(wire) = wire
          Ok(RichTextRoom(
            a,
            b,
            c,
            list.append(pending, [Authored("B", wire)]),
            acted,
            sequence_number,
          ))
        }
        _ -> Ok(RichTextRoom(a, b, c, pending, acted, sequence_number))
      }
    }
  }
}

pub fn remaining_demo_insert(
  room: RemainingDemoRoom,
  replica: String,
  index: Int,
  stop: String,
) -> Result(RemainingDemoRoom, String) {
  use _ <- result.try(valid_replica(replica))
  case room {
    SequenceRoom(a, b, c, pending, acted) -> {
      case string.trim(stop) {
        "" -> Error("trail stop name must not be empty")
        name -> {
          let state = case replica {
            "A" -> a
            "B" -> b
            _ -> c
          }
          use #(state, _, operation) <- result.try(
            sequence_kernel.p2p_insert(state, index, json.string(name))
            |> result.map_error(fn(error) {
              "SharedSequence insertion failed: "
              <> sequence_kernel.edit_error_detail(error)
            }),
          )
          let #(a, b, c) = case replica {
            "A" -> #(state, b, c)
            "B" -> #(a, state, c)
            _ -> #(a, b, state)
          }
          Ok(SequenceRoom(
            a,
            b,
            c,
            list.append(pending, [Authored(replica, operation)]),
            acted,
          ))
        }
      }
    }
    _ -> Error("trail stop insertion requires SharedSequence")
  }
}

pub fn remaining_demo_text_edit(
  room: RemainingDemoRoom,
  replica: String,
  start: Int,
  end: Int,
  inserted: String,
) -> Result(RemainingDemoRoom, String) {
  use _ <- result.try(valid_replica(replica))
  case room {
    TextRoom(a, b, c, pending, acted, sequence_number) -> {
      let state = case replica {
        "A" -> a
        "B" -> b
        _ -> c
      }
      case start == end, inserted == "" {
        True, True -> Error("text edit must change the document")
        same_position, empty_insert -> {
          use #(state, _, submission) <- result.try(
            case same_position, empty_insert {
              True, False -> text_kernel.insert(state, start, inserted)
              False, True ->
                text_kernel.delete_range(state, start, end)
              False, False ->
                text_kernel.replace_range(state, start, end, inserted)
              True, True -> panic as "handled above"
            }
            |> result.map_error(fn(error) {
              "SharedText edit failed: " <> text_kernel.edit_error_detail(error)
            }),
          )
          let assert Some(text_kernel.Submission(operation, _)) = submission
          let #(a, b, c) = case replica {
            "A" -> #(state, b, c)
            "B" -> #(a, state, c)
            _ -> #(a, b, state)
          }
          Ok(TextRoom(
            a,
            b,
            c,
            list.append(pending, [Authored(replica, operation)]),
            acted,
            sequence_number,
          ))
        }
      }
    }
    _ -> Error("text editing requires SharedText")
  }
}

pub fn remaining_demo_deliver(
  room: RemainingDemoRoom,
) -> Result(RemainingDemoRoom, String) {
  case room {
    SequenceRoom(a, b, c, pending, acted) -> {
      let #(a, b, c) =
        list.fold(pending, #(a, b, c), fn(states, authored) {
          #(
            sequence_kernel.apply_remote(states.0, authored.operation).0,
            sequence_kernel.apply_remote(states.1, authored.operation).0,
            sequence_kernel.apply_remote(states.2, authored.operation).0,
          )
        })
      Ok(SequenceRoom(a, b, c, [], acted))
    }
    TextRoom(a, b, c, pending, acted, sequence_number) ->
      deliver_text(a, b, c, pending, acted, sequence_number)
    ClaimsRoom(a, b, c, pending, acted, sequence_number) ->
      deliver_claims(a, b, c, pending, acted, sequence_number)
    OrderedRoom(a, b, c, pending, acted, sequence_number) ->
      deliver_ordered(a, b, c, pending, acted, sequence_number)
    TaskRoom(a, b, c, pending, acted, sequence_number) ->
      deliver_tasks(a, b, c, pending, acted, sequence_number)
    PactRoom(a, b, c, proposal, signoffs, acted, sequence_number) ->
      deliver_pact(a, b, c, proposal, signoffs, acted, sequence_number)
    JsonOtRoom(a, b, c, pending, acted, sequence_number) ->
      deliver_json_ot(a, b, c, pending, acted, sequence_number)
    RichTextRoom(a, b, c, pending, acted, sequence_number) ->
      deliver_rich_text(a, b, c, pending, acted, sequence_number)
  }
}

pub fn remaining_demo_snapshot(
  room: RemainingDemoRoom,
) -> Result(RemainingDemoSnapshot, String) {
  case room {
    SequenceRoom(a, b, c, pending, _) ->
      Ok(RemainingDemoSnapshot(
        sequence_values(a),
        sequence_values(b),
        sequence_values(c),
        list.length(pending),
        0,
      ))
    TextRoom(a, b, c, pending, _, sequence_number) ->
      Ok(RemainingDemoSnapshot(
        [text_kernel.value(a)],
        [text_kernel.value(b)],
        [text_kernel.value(c)],
        list.length(pending),
        sequence_number,
      ))
    ClaimsRoom(a, b, c, pending, _, sequence_number) ->
      Ok(RemainingDemoSnapshot(
        claims_values(a),
        claims_values(b),
        claims_values(c),
        list.length(pending),
        sequence_number,
      ))
    OrderedRoom(a, b, c, pending, _, sequence_number) ->
      Ok(RemainingDemoSnapshot(
        ordered_values(a),
        ordered_values(b),
        ordered_values(c),
        list.length(pending),
        sequence_number,
      ))
    TaskRoom(a, b, c, pending, _, sequence_number) ->
      Ok(RemainingDemoSnapshot(
        task_values(a),
        task_values(b),
        task_values(c),
        list.length(pending),
        sequence_number,
      ))
    PactRoom(a, b, c, proposal, signoffs, _, sequence_number) -> {
      let queued = case proposal {
        Some(_) -> 1
        None -> list.length(signoffs)
      }
      Ok(RemainingDemoSnapshot(
        pact_values(a),
        pact_values(b),
        pact_values(c),
        queued,
        sequence_number,
      ))
    }
    JsonOtRoom(a, b, c, pending, _, sequence_number) -> {
      use a <- result.try(json_ot_value(a))
      use b <- result.try(json_ot_value(b))
      use c <- result.try(json_ot_value(c))
      Ok(RemainingDemoSnapshot(
        [a],
        [b],
        [c],
        list.length(pending),
        sequence_number,
      ))
    }
    RichTextRoom(a, b, c, pending, _, sequence_number) -> {
      use a <- result.try(rich_text_value(a))
      use b <- result.try(rich_text_value(b))
      use c <- result.try(rich_text_value(c))
      Ok(RemainingDemoSnapshot(
        [a],
        [b],
        [c],
        list.length(pending),
        sequence_number,
      ))
    }
  }
}

fn new_sequence_room() -> Result(RemainingDemoRoom, String) {
  let a = sequence_kernel.new(replica_id.new("A"))
  use a <- result.try(
    list.try_fold(["Bridge", "Weir", "North gate"], a, fn(state, value) {
      sequence_kernel.p2p_insert(
        state,
        sequence_kernel.length(state),
        json.string(value),
      )
      |> result.map(fn(update) { update.0 })
      |> result.map_error(fn(_) { "SharedSequence initialization failed" })
    }),
  )
  let summary = a |> sequence_kernel.summary |> json.to_string
  use b <- result.try(
    sequence_kernel.from_summary(summary, replica_id.new("B"))
    |> result.map_error(fn(_) { "SharedSequence summary failed" }),
  )
  use c <- result.try(
    sequence_kernel.from_summary(summary, replica_id.new("C"))
    |> result.map_error(fn(_) { "SharedSequence summary failed" }),
  )
  Ok(SequenceRoom(a, b, c, [], []))
}

fn new_text_room() -> Result(RemainingDemoRoom, String) {
  let #(a, _, submission) =
    text_kernel.append(text_kernel.new(replica_id.new("A")), "The weir is clear.")
  let assert Some(text_kernel.Submission(operation, _)) = submission
  use a <- result.try(
    text_kernel.ack_local(a, operation)
    |> result.map_error(fn(_) { "SharedText initialization failed" }),
  )
  let summary = a |> text_kernel.summary |> json.to_string
  use b <- result.try(
    text_kernel.from_summary(summary, replica_id.new("B"))
    |> result.map_error(fn(_) { "SharedText summary failed" }),
  )
  use c <- result.try(
    text_kernel.from_summary(summary, replica_id.new("C"))
    |> result.map_error(fn(_) { "SharedText summary failed" }),
  )
  Ok(TextRoom(a, b, c, [], [], 0))
}

fn new_rich_text_room() -> Result(RemainingDemoRoom, String) {
  use document <- result.try(
    rich_text.document_insert_text(
      rich_text.empty_document(),
      "Hello World",
      rich_text.attributes([]),
    )
    |> result.map_error(fn(_) { "SharedRichText initialization failed" }),
  )
  Ok(RichTextRoom(
    rich_text_kernel.from_document(document),
    rich_text_kernel.from_document(document),
    rich_text_kernel.from_document(document),
    [],
    [],
    0,
  ))
}

fn deliver_claims(
  a: claims_kernel.ClaimsState,
  b: claims_kernel.ClaimsState,
  c: claims_kernel.ClaimsState,
  pending: List(Authored(claims_kernel.ClaimOperation)),
  acted: List(String),
  sequence_number: Int,
) -> Result(RemainingDemoRoom, String) {
  use delivered <- result.try(
    list.try_fold(pending, #(a, b, c, sequence_number), fn(states, authored) {
      let sequence_number = states.3 + 1
      use a <- result.try(
        apply_claim(states.0, authored, "A", sequence_number),
      )
      use b <- result.try(
        apply_claim(states.1, authored, "B", sequence_number),
      )
      use c <- result.try(
        apply_claim(states.2, authored, "C", sequence_number),
      )
      Ok(#(a, b, c, sequence_number))
    }),
  )
  Ok(ClaimsRoom(
    delivered.0,
    delivered.1,
    delivered.2,
    [],
    acted,
    delivered.3,
  ))
}

fn apply_claim(
  state: claims_kernel.ClaimsState,
  authored: Authored(claims_kernel.ClaimOperation),
  recipient: String,
  sequence_number: Int,
) -> Result(claims_kernel.ClaimsState, String) {
  case authored.author == recipient {
    True ->
      claims_kernel.ack_local(state, authored.operation, sequence_number)
      |> result.map(fn(update) { update.0 })
      |> result.map_error(fn(_) { "Claims acknowledgement failed" })
    False ->
      Ok(claims_kernel.apply_remote(
        state,
        authored.operation,
        sequence_number,
      ).0)
  }
}

fn deliver_ordered(
  a: ordered_collection_kernel.OrderedState,
  b: ordered_collection_kernel.OrderedState,
  c: ordered_collection_kernel.OrderedState,
  pending: List(Authored(ordered_collection_kernel.OrderedOperation)),
  acted: List(String),
  sequence_number: Int,
) -> Result(RemainingDemoRoom, String) {
  let delivered =
    list.fold(pending, #(a, b, c, sequence_number), fn(states, authored) {
      let author = replica_number(authored.author)
      let sequence_number = states.3 + 1
      let apply = fn(state, recipient) {
        case authored.author == recipient {
          True ->
            ordered_collection_kernel.ack_local(
              state,
              authored.operation,
              author,
            ).0
          False ->
            ordered_collection_kernel.apply_remote(
              state,
              authored.operation,
              author,
            ).0
        }
      }
      #(
        apply(states.0, "A"),
        apply(states.1, "B"),
        apply(states.2, "C"),
        sequence_number,
      )
    })
  Ok(OrderedRoom(
    delivered.0,
    delivered.1,
    delivered.2,
    [],
    acted,
    delivered.3,
  ))
}

fn deliver_tasks(
  a: task_manager_kernel.TaskManagerState,
  b: task_manager_kernel.TaskManagerState,
  c: task_manager_kernel.TaskManagerState,
  pending: List(TaskOperation),
  acted: List(String),
  sequence_number: Int,
) -> Result(RemainingDemoRoom, String) {
  use delivered <- result.try(
    list.try_fold(pending, #(a, b, c, sequence_number), fn(states, authored) {
      let author = replica_number(authored.author)
      let sequence_number = states.3 + 1
      use a <- result.try(apply_task(states.0, authored, "A", author))
      use b <- result.try(apply_task(states.1, authored, "B", author))
      use c <- result.try(apply_task(states.2, authored, "C", author))
      Ok(#(a, b, c, sequence_number))
    }),
  )
  Ok(TaskRoom(
    delivered.0,
    delivered.1,
    delivered.2,
    [],
    acted,
    delivered.3,
  ))
}

fn apply_task(
  state: task_manager_kernel.TaskManagerState,
  authored: TaskOperation,
  recipient: String,
  author: Int,
) -> Result(task_manager_kernel.TaskManagerState, String) {
  case authored.author == recipient {
    True ->
      task_manager_kernel.ack_local(
        state,
        authored.operation,
        author,
        authored.message_id,
        [1, 2, 3],
      )
      |> result.map(fn(update) { update.0 })
      |> result.map_error(fn(_) { "TaskManager acknowledgement failed" })
    False ->
      Ok(task_manager_kernel.apply_remote(
        state,
        authored.operation,
        author,
        [1, 2, 3],
      ).0)
  }
}

fn deliver_pact(
  a: pact_map_kernel.PactMapState,
  b: pact_map_kernel.PactMapState,
  c: pact_map_kernel.PactMapState,
  proposal: Option(pact_map_kernel.PactMapOperation),
  signoffs: List(Int),
  acted: List(String),
  sequence_number: Int,
) -> Result(RemainingDemoRoom, String) {
  let #(a, b, c, sequence_number) = case proposal {
    None -> #(a, b, c, sequence_number)
    Some(operation) -> {
      let sequence_number = sequence_number + 1
      #(
        pact_map_kernel.apply_set(a, operation, sequence_number, [1, 2, 3], 1).0,
        pact_map_kernel.apply_set(b, operation, sequence_number, [1, 2, 3], 2).0,
        pact_map_kernel.apply_set(c, operation, sequence_number, [1, 2, 3], 3).0,
        sequence_number,
      )
    }
  }
  use delivered <- result.try(
    list.try_fold(signoffs, #(a, b, c, sequence_number), fn(states, client) {
      let sequence_number = states.3 + 1
      use a <- result.try(
        pact_map_kernel.apply_accept(
          states.0,
          "closure-target",
          client,
          sequence_number,
        )
        |> result.map(fn(update) { update.0 })
        |> result.map_error(fn(_) { "PactMap acceptance failed" }),
      )
      use b <- result.try(
        pact_map_kernel.apply_accept(
          states.1,
          "closure-target",
          client,
          sequence_number,
        )
        |> result.map(fn(update) { update.0 })
        |> result.map_error(fn(_) { "PactMap acceptance failed" }),
      )
      use c <- result.try(
        pact_map_kernel.apply_accept(
          states.2,
          "closure-target",
          client,
          sequence_number,
        )
        |> result.map(fn(update) { update.0 })
        |> result.map_error(fn(_) { "PactMap acceptance failed" }),
      )
      Ok(#(a, b, c, sequence_number))
    }),
  )
  Ok(PactRoom(
    delivered.0,
    delivered.1,
    delivered.2,
    None,
    [],
    acted,
    delivered.3,
  ))
}

fn deliver_json_ot(
  a: json_ot_kernel.JsonOtState,
  b: json_ot_kernel.JsonOtState,
  c: json_ot_kernel.JsonOtState,
  pending: List(Authored(json_ot_kernel.JsonOtWireOperation)),
  acted: List(String),
  sequence_number: Int,
) -> Result(RemainingDemoRoom, String) {
  use delivered <- result.try(
    list.try_fold(pending, #(a, b, c, sequence_number), fn(states, authored) {
      let sequence_number = states.3 + 1
      use a <- result.try(
        apply_json_ot(states.0, authored, "A", sequence_number),
      )
      use b <- result.try(
        apply_json_ot(states.1, authored, "B", sequence_number),
      )
      use c <- result.try(
        apply_json_ot(states.2, authored, "C", sequence_number),
      )
      Ok(#(a, b, c, sequence_number))
    }),
  )
  Ok(JsonOtRoom(
    delivered.0,
    delivered.1,
    delivered.2,
    [],
    acted,
    delivered.3,
  ))
}

fn deliver_text(
  a: text_kernel.TextState,
  b: text_kernel.TextState,
  c: text_kernel.TextState,
  pending: List(Authored(text_kernel.TextOperation)),
  acted: List(String),
  sequence_number: Int,
) -> Result(RemainingDemoRoom, String) {
  use delivered <- result.try(
    list.try_fold(pending, #(a, b, c, sequence_number), fn(states, authored) {
      let sequence_number = states.3 + 1
      use a <- result.try(apply_text(states.0, authored, "A"))
      use b <- result.try(apply_text(states.1, authored, "B"))
      use c <- result.try(apply_text(states.2, authored, "C"))
      Ok(#(a, b, c, sequence_number))
    }),
  )
  Ok(TextRoom(
    delivered.0,
    delivered.1,
    delivered.2,
    [],
    acted,
    delivered.3,
  ))
}

fn apply_text(
  state: text_kernel.TextState,
  authored: Authored(text_kernel.TextOperation),
  recipient: String,
) -> Result(text_kernel.TextState, String) {
  case authored.author == recipient {
    True ->
      text_kernel.ack_local(state, authored.operation)
      |> result.map_error(fn(_) { "SharedText acknowledgement failed" })
    False -> Ok(text_kernel.apply_remote(state, authored.operation).0)
  }
}

fn apply_json_ot(
  state: json_ot_kernel.JsonOtState,
  authored: Authored(json_ot_kernel.JsonOtWireOperation),
  recipient: String,
  sequence_number: Int,
) -> Result(json_ot_kernel.JsonOtState, String) {
  let update = case authored.author == recipient {
    True ->
      json_ot_kernel.ack_local(
        state,
        authored.operation,
        sequence_number,
        0,
      )
    False ->
      json_ot_kernel.apply_remote(
        state,
        authored.operation,
        sequence_number,
        0,
      )
  }
  update
  |> result.map(fn(value) { value.0 })
  |> result.map_error(fn(_) { "JsonOt delivery failed" })
}

fn deliver_rich_text(
  a: rich_text_kernel.RichTextState,
  b: rich_text_kernel.RichTextState,
  c: rich_text_kernel.RichTextState,
  pending: List(Authored(rich_text_kernel.RichTextWireOperation)),
  acted: List(String),
  sequence_number: Int,
) -> Result(RemainingDemoRoom, String) {
  use delivered <- result.try(
    list.try_fold(pending, #(a, b, c, sequence_number), fn(states, authored) {
      let sequence_number = states.3 + 1
      use a <- result.try(
        apply_rich_text(states.0, authored, "A", sequence_number),
      )
      use b <- result.try(
        apply_rich_text(states.1, authored, "B", sequence_number),
      )
      use c <- result.try(
        apply_rich_text(states.2, authored, "C", sequence_number),
      )
      Ok(#(a, b, c, sequence_number))
    }),
  )
  Ok(RichTextRoom(
    delivered.0,
    delivered.1,
    delivered.2,
    [],
    acted,
    delivered.3,
  ))
}

fn apply_rich_text(
  state: rich_text_kernel.RichTextState,
  authored: Authored(rich_text_kernel.RichTextWireOperation),
  recipient: String,
  sequence_number: Int,
) -> Result(rich_text_kernel.RichTextState, String) {
  let update = case authored.author == recipient {
    True ->
      rich_text_kernel.ack_local(
        state,
        authored.operation,
        sequence_number,
        0,
      )
    False ->
      rich_text_kernel.apply_remote(
        state,
        authored.operation,
        sequence_number,
        0,
      )
  }
  update
  |> result.map(fn(value) { value.0 })
  |> result.map_error(fn(_) { "SharedRichText delivery failed" })
}

fn sequence_values(state: sequence_kernel.SequenceState) -> List(String) {
  state
  |> sequence_kernel.values
  |> list.map(json_string)
}

fn claims_values(state: claims_kernel.ClaimsState) -> List(String) {
  case claims_kernel.get(state, "gate-key") {
    Ok(value) -> ["gate-key: " <> json_string(value)]
    Error(_) -> ["gate-key: unclaimed"]
  }
}

fn ordered_values(
  state: ordered_collection_kernel.OrderedState,
) -> List(String) {
  let owners =
    ordered_collection_kernel.summary_jobs(state)
    |> list.map(fn(entry) {
      let #(acquire_id, ordered_collection_kernel.JobEntry(value, _)) = entry
      replica_name(acquire_id) <> " owns " <> json_string(value)
    })
  let queue = ordered_collection_kernel.summary_queue(state)
  let queue_values = case queue {
    [] -> ["Queue empty"]
    values -> list.map(values, fn(value) { "Queue: " <> json_string(value) })
  }
  case owners {
    [] -> queue_values
    _ -> list.append(owners, queue_values)
  }
}

fn task_values(state: task_manager_kernel.TaskManagerState) -> List(String) {
  let queue =
    task_manager_kernel.summary_queues(state)
    |> list.find(fn(entry) { entry.0 == "dispatcher" })
  case queue {
    Error(_) -> ["dispatcher: unassigned"]
    Ok(#(_, [])) -> ["dispatcher: unassigned"]
    Ok(#(_, [owner, ..waiting])) -> {
      let assigned = "dispatcher: " <> replica_name_from_number(owner)
      case waiting {
        [] -> [assigned]
        _ -> [
          assigned,
          "waiting: "
            <> string.join(list.map(waiting, replica_name_from_number), ", "),
        ]
      }
    }
  }
}

fn pact_values(state: pact_map_kernel.PactMapState) -> List(String) {
  case pact_map_kernel.get(state, "closure-target") {
    Ok(value) -> [
      "closure-target: " <> json_string(value),
      "accepted by A, B, C",
    ]
    Error(_) -> ["closure-target: absent"]
  }
}

fn json_ot_value(
  state: json_ot_kernel.JsonOtState,
) -> Result(String, String) {
  json_ot_kernel.view(state)
  |> result.map(fn(value) { value |> json_ot.to_json |> json.to_string })
  |> result.map_error(fn(_) { "JsonOt view failed" })
}

fn rich_text_value(
  state: rich_text_kernel.RichTextState,
) -> Result(String, String) {
  use document <- result.try(
    rich_text_kernel.view(state)
    |> result.map_error(fn(_) { "SharedRichText view failed" }),
  )
  Ok(
    rich_text.document_to_operations(document)
    |> list.fold("", fn(output, operation) {
      case operation {
        operation_iterator.InsertText(text, attributes) -> {
          let marker = case attribute_map.get(attributes, "bold") {
            Ok(json_ot.VBool(True)) -> " [bold]"
            _ -> ""
          }
          output <> text <> marker
        }
        operation_iterator.InsertEmbed(_, _) -> output <> " [embed]"
        operation_iterator.Delete(_) | operation_iterator.Retain(_, _) -> output
      }
    }),
  )
}

fn valid_replica(replica: String) -> Result(Nil, String) {
  case replica {
    "A" | "B" | "C" -> Ok(Nil)
    _ -> Error("replica must be A, B, or C")
  }
}

fn mark_acted(
  acted: List(String),
  replica: String,
) -> Result(List(String), String) {
  case list.contains(acted, replica) {
    True -> Error("this client already acted in the current race")
    False -> Ok(list.append(acted, [replica]))
  }
}

fn replica_number(replica: String) -> Int {
  case replica {
    "A" -> 1
    "B" -> 2
    _ -> 3
  }
}

fn replica_name(replica: String) -> String {
  case replica {
    "A" -> "Alice"
    "B" -> "Bob"
    _ -> "Carol"
  }
}

fn replica_name_from_number(replica: Int) -> String {
  case replica {
    1 -> "Alice"
    2 -> "Bob"
    _ -> "Carol"
  }
}

fn json_string(value: json.Json) -> String {
  let assert Ok(value) =
    value
    |> json.to_string
    |> json.parse(decode.string)
  value
}
