import gleam/list
import gleam/result
import watershed
import watershed/sluice_js

pub opaque type GCounterRoom {
  GCounterRoom(
    sluice: sluice_js.Sluice,
    a: watershed.GCounter,
    b: watershed.GCounter,
    c: watershed.GCounter,
    a_client: String,
    b_client: String,
    c_client: String,
  )
}

pub type GCounterRoomSnapshot {
  GCounterRoomSnapshot(
    a: Int,
    b: Int,
    c: Int,
    pending: Bool,
    sequence_number: Int,
  )
}

pub type TransportDelivery {
  TransportDelivery(
    to: String,
    event: String,
    sequence_number: Int,
    author: String,
  )
}

pub fn new_gcounter_room() -> Result(GCounterRoom, String) {
  let sluice = sluice_js.start(tenant: "atlas", document: "gcounter-demo")
  let document_a = sluice_js.connect(sluice, "A")
  let document_b = sluice_js.connect(sluice, "B")
  let document_c = sluice_js.connect(sluice, "C")
  sluice_js.settle(sluice)
  use counter_a <- result.try(watershed.create_g_counter(document_a))
  watershed.set(
    watershed.root(document_a),
    "counter",
    watershed.g_counter_handle_of(counter_a),
  )
  sluice_js.settle(sluice)
  use counter_b <- result.try(gcounter_from_document(document_b))
  use counter_c <- result.try(gcounter_from_document(document_c))
  use a_client <- result.try(room_client_id(sluice, document_a))
  use b_client <- result.try(room_client_id(sluice, document_b))
  use c_client <- result.try(room_client_id(sluice, document_c))
  Ok(GCounterRoom(
    sluice,
    counter_a,
    counter_b,
    counter_c,
    a_client,
    b_client,
    c_client,
  ))
}

fn gcounter_from_document(
  document: watershed.Document(a),
) -> Result(watershed.GCounter, String) {
  case watershed.get(watershed.root(document), "counter") {
    Error(_) -> Error("the shared G-counter handle is missing")
    Ok(handle) -> watershed.resolve_g_counter(document, handle)
  }
}

fn room_client_id(
  sluice: sluice_js.Sluice,
  document: watershed.Document(a),
) -> Result(String, String) {
  case sluice_js.client_id(sluice, document) {
    Error(_) -> Error("Sluice did not assign a client ID")
    Ok(id) -> Ok(id)
  }
}

pub fn gcounter_room_stage_race(
  room: GCounterRoom,
) -> Result(GCounterRoom, String) {
  let GCounterRoom(_, a, b, _, _, _, _) = room
  use _ <- result.try(watershed.g_counter_increment(a, 7))
  use _ <- result.try(watershed.g_counter_increment(b, 3))
  Ok(room)
}

pub fn gcounter_room_deliver(
  room: GCounterRoom,
) -> #(GCounterRoom, List(TransportDelivery)) {
  let GCounterRoom(sluice, _, _, _, a_client, b_client, c_client) = room
  #(
    room,
    drain_deliveries(sluice, a_client, b_client, c_client, []),
  )
}

pub fn gcounter_room_resend_b(
  room: GCounterRoom,
) -> Result(#(GCounterRoom, List(TransportDelivery)), String) {
  let GCounterRoom(_, _, b, _, _, _, _) = room
  use _ <- result.try(watershed.g_counter_increment(b, 0))
  Ok(gcounter_room_deliver(room))
}

fn drain_deliveries(
  sluice: sluice_js.Sluice,
  a_client: String,
  b_client: String,
  c_client: String,
  deliveries: List(TransportDelivery),
) -> List(TransportDelivery) {
  case sluice_js.step_info(sluice) {
    Error(_) -> list.reverse(deliveries)
    Ok(delivery) -> {
      let mapped = TransportDelivery(
        client_name(delivery.to, a_client, b_client, c_client),
        delivery.event,
        delivery.sequence_number,
        client_name(delivery.author, a_client, b_client, c_client),
      )
      drain_deliveries(sluice, a_client, b_client, c_client, [
        mapped,
        ..deliveries
      ])
    }
  }
}

fn client_name(
  client: String,
  a_client: String,
  b_client: String,
  c_client: String,
) -> String {
  case client {
    id if id == a_client -> "A"
    id if id == b_client -> "B"
    id if id == c_client -> "C"
    _ -> client
  }
}

pub fn gcounter_room_snapshot(
  room: GCounterRoom,
) -> Result(GCounterRoomSnapshot, String) {
  let GCounterRoom(sluice, a, b, c, _, _, _) = room
  use a_value <- result.try(counter_value(a, "A"))
  use b_value <- result.try(counter_value(b, "B"))
  use c_value <- result.try(counter_value(c, "C"))
  Ok(GCounterRoomSnapshot(
    a_value,
    b_value,
    c_value,
    sluice_js.pending(sluice),
    sluice_js.sequence_number(sluice),
  ))
}

fn counter_value(
  counter: watershed.GCounter,
  replica: String,
) -> Result(Int, String) {
  case watershed.g_counter_value(counter) {
    Error(_) -> Error("the G-counter handle at replica " <> replica <> " is invalid")
    Ok(value) -> Ok(value)
  }
}
