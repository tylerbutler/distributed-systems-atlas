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

pub opaque type PnCounterRoom {
  PnCounterRoom(
    sluice: sluice_js.Sluice,
    a: watershed.PnCounter,
    b: watershed.PnCounter,
    c: watershed.PnCounter,
    a_client: String,
    b_client: String,
    c_client: String,
  )
}

pub opaque type SharedCounterRoom {
  SharedCounterRoom(
    sluice: sluice_js.Sluice,
    a: watershed.SharedCounter,
    b: watershed.SharedCounter,
    c: watershed.SharedCounter,
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

pub type PnCounterRoomSnapshot {
  PnCounterRoomSnapshot(
    a: Int,
    b: Int,
    c: Int,
    pending: Bool,
    sequence_number: Int,
  )
}

pub type SharedCounterRoomSnapshot {
  SharedCounterRoomSnapshot(
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

pub fn new_pncounter_room() -> Result(PnCounterRoom, String) {
  let sluice = sluice_js.start(tenant: "atlas", document: "pncounter-demo")
  let document_a = sluice_js.connect(sluice, "A")
  let document_b = sluice_js.connect(sluice, "B")
  let document_c = sluice_js.connect(sluice, "C")
  sluice_js.settle(sluice)
  use counter_a <- result.try(watershed.create_pn_counter(document_a))
  watershed.set(
    watershed.root(document_a),
    "counter",
    watershed.pn_counter_handle_of(counter_a),
  )
  sluice_js.settle(sluice)
  use counter_b <- result.try(pncounter_from_document(document_b))
  use counter_c <- result.try(pncounter_from_document(document_c))
  watershed.pn_counter_update(counter_a, 10)
  sluice_js.settle(sluice)
  use a_client <- result.try(room_client_id(sluice, document_a))
  use b_client <- result.try(room_client_id(sluice, document_b))
  use c_client <- result.try(room_client_id(sluice, document_c))
  Ok(PnCounterRoom(
    sluice,
    counter_a,
    counter_b,
    counter_c,
    a_client,
    b_client,
    c_client,
  ))
}

pub fn new_sharedcounter_room() -> Result(SharedCounterRoom, String) {
  let sluice = sluice_js.start(tenant: "atlas", document: "sharedcounter-demo")
  let document_a = sluice_js.connect(sluice, "A")
  let document_b = sluice_js.connect(sluice, "B")
  let document_c = sluice_js.connect(sluice, "C")
  sluice_js.settle(sluice)
  use counter_a <- result.try(watershed.create_counter(document_a))
  watershed.set(
    watershed.root(document_a),
    "counter",
    watershed.counter_handle_of(counter_a),
  )
  sluice_js.settle(sluice)
  use counter_b <- result.try(sharedcounter_from_document(document_b))
  use counter_c <- result.try(sharedcounter_from_document(document_c))
  watershed.increment(counter_a, 10)
  sluice_js.settle(sluice)
  use a_client <- result.try(room_client_id(sluice, document_a))
  use b_client <- result.try(room_client_id(sluice, document_b))
  use c_client <- result.try(room_client_id(sluice, document_c))
  Ok(SharedCounterRoom(
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

fn pncounter_from_document(
  document: watershed.Document(a),
) -> Result(watershed.PnCounter, String) {
  case watershed.get(watershed.root(document), "counter") {
    Error(_) -> Error("the shared PN-counter handle is missing")
    Ok(handle) -> watershed.resolve_pn_counter(document, handle)
  }
}

fn sharedcounter_from_document(
  document: watershed.Document(a),
) -> Result(watershed.SharedCounter, String) {
  case watershed.get(watershed.root(document), "counter") {
    Error(_) -> Error("the shared counter handle is missing")
    Ok(handle) -> watershed.resolve_counter(document, handle)
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

pub fn gcounter_room_increment(
  room: GCounterRoom,
  replica: String,
  amount: Int,
) -> Result(GCounterRoom, String) {
  let GCounterRoom(_, a, b, c, _, _, _) = room
  let counter = case replica {
    "A" -> Ok(a)
    "B" -> Ok(b)
    "C" -> Ok(c)
    _ -> Error("the G-counter replica must be A, B, or C")
  }
  use counter <- result.try(counter)
  use _ <- result.try(watershed.g_counter_increment(counter, amount))
  Ok(room)
}

pub fn pncounter_room_stage_race(
  room: PnCounterRoom,
) -> Result(PnCounterRoom, String) {
  let PnCounterRoom(_, a, b, _, _, _, _) = room
  watershed.pn_counter_update(a, 3)
  watershed.pn_counter_update(b, -1)
  Ok(room)
}

pub fn pncounter_room_update(
  room: PnCounterRoom,
  replica: String,
  amount: Int,
) -> Result(PnCounterRoom, String) {
  let PnCounterRoom(_, a, b, c, _, _, _) = room
  let counter = case replica {
    "A" -> Ok(a)
    "B" -> Ok(b)
    "C" -> Ok(c)
    _ -> Error("the PN-counter replica must be A, B, or C")
  }
  use counter <- result.try(counter)
  watershed.pn_counter_update(counter, amount)
  Ok(room)
}

pub fn sharedcounter_room_stage_race(
  room: SharedCounterRoom,
) -> Result(SharedCounterRoom, String) {
  let SharedCounterRoom(_, a, b, _, _, _, _) = room
  watershed.increment(a, 3)
  watershed.increment(b, -1)
  Ok(room)
}

pub fn sharedcounter_room_update(
  room: SharedCounterRoom,
  replica: String,
  amount: Int,
) -> Result(SharedCounterRoom, String) {
  let SharedCounterRoom(_, a, b, c, _, _, _) = room
  let counter = case replica {
    "A" -> Ok(a)
    "B" -> Ok(b)
    "C" -> Ok(c)
    _ -> Error("the SharedCounter replica must be A, B, or C")
  }
  use counter <- result.try(counter)
  watershed.increment(counter, amount)
  Ok(room)
}

pub fn gcounter_room_deliver(
  room: GCounterRoom,
) -> #(GCounterRoom, List(TransportDelivery)) {
  let GCounterRoom(sluice, _, _, _, a_client, b_client, c_client) = room
  #(room, drain_deliveries(sluice, a_client, b_client, c_client, []))
}

pub fn gcounter_room_deliver_one(
  room: GCounterRoom,
) -> #(GCounterRoom, List(TransportDelivery)) {
  let GCounterRoom(sluice, _, _, _, a_client, b_client, c_client) = room
  case sluice_js.step_info(sluice) {
    Error(_) -> #(room, [])
    Ok(delivery) -> {
      let sequence_number = delivery.sequence_number
      #(
        room,
        drain_sequence(sluice, a_client, b_client, c_client, sequence_number, [
          map_delivery(delivery, a_client, b_client, c_client),
        ]),
      )
    }
  }
}

pub fn pncounter_room_deliver(
  room: PnCounterRoom,
) -> #(PnCounterRoom, List(TransportDelivery)) {
  let PnCounterRoom(sluice, _, _, _, a_client, b_client, c_client) = room
  #(room, drain_deliveries(sluice, a_client, b_client, c_client, []))
}

pub fn pncounter_room_deliver_one(
  room: PnCounterRoom,
) -> #(PnCounterRoom, List(TransportDelivery)) {
  let PnCounterRoom(sluice, _, _, _, a_client, b_client, c_client) = room
  case sluice_js.step_info(sluice) {
    Error(_) -> #(room, [])
    Ok(delivery) -> {
      let sequence_number = delivery.sequence_number
      #(
        room,
        drain_sequence(sluice, a_client, b_client, c_client, sequence_number, [
          map_delivery(delivery, a_client, b_client, c_client),
        ]),
      )
    }
  }
}

pub fn sharedcounter_room_deliver(
  room: SharedCounterRoom,
) -> #(SharedCounterRoom, List(TransportDelivery)) {
  let SharedCounterRoom(sluice, _, _, _, a_client, b_client, c_client) = room
  #(room, drain_deliveries(sluice, a_client, b_client, c_client, []))
}

pub fn sharedcounter_room_deliver_one(
  room: SharedCounterRoom,
) -> #(SharedCounterRoom, List(TransportDelivery)) {
  let SharedCounterRoom(sluice, _, _, _, a_client, b_client, c_client) = room
  case sluice_js.step_info(sluice) {
    Error(_) -> #(room, [])
    Ok(delivery) -> {
      let sequence_number = delivery.sequence_number
      #(
        room,
        drain_sequence(sluice, a_client, b_client, c_client, sequence_number, [
          map_delivery(delivery, a_client, b_client, c_client),
        ]),
      )
    }
  }
}

pub fn gcounter_room_resend(
  room: GCounterRoom,
  replica: String,
) -> Result(#(GCounterRoom, List(TransportDelivery)), String) {
  use room <- result.try(gcounter_room_increment(room, replica, 0))
  Ok(gcounter_room_deliver(room))
}

fn drain_sequence(
  sluice: sluice_js.Sluice,
  a_client: String,
  b_client: String,
  c_client: String,
  sequence_number: Int,
  deliveries: List(TransportDelivery),
) -> List(TransportDelivery) {
  case sluice_js.peek_info(sluice) {
    Ok(next) if next.sequence_number == sequence_number -> {
      let assert Ok(delivery) = sluice_js.step_info(sluice)
      drain_sequence(sluice, a_client, b_client, c_client, sequence_number, [
        map_delivery(delivery, a_client, b_client, c_client),
        ..deliveries
      ])
    }
    _ -> list.reverse(deliveries)
  }
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
      let mapped = map_delivery(delivery, a_client, b_client, c_client)
      drain_deliveries(sluice, a_client, b_client, c_client, [
        mapped,
        ..deliveries
      ])
    }
  }
}

fn map_delivery(
  delivery: sluice_js.Delivery,
  a_client: String,
  b_client: String,
  c_client: String,
) -> TransportDelivery {
  TransportDelivery(
    client_name(delivery.to, a_client, b_client, c_client),
    delivery.event,
    delivery.sequence_number,
    client_name(delivery.author, a_client, b_client, c_client),
  )
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

pub fn pncounter_room_snapshot(
  room: PnCounterRoom,
) -> Result(PnCounterRoomSnapshot, String) {
  let PnCounterRoom(sluice, a, b, c, _, _, _) = room
  use a_value <- result.try(pncounter_value(a, "A"))
  use b_value <- result.try(pncounter_value(b, "B"))
  use c_value <- result.try(pncounter_value(c, "C"))
  Ok(PnCounterRoomSnapshot(
    a_value,
    b_value,
    c_value,
    sluice_js.pending(sluice),
    sluice_js.sequence_number(sluice),
  ))
}

pub fn sharedcounter_room_snapshot(
  room: SharedCounterRoom,
) -> Result(SharedCounterRoomSnapshot, String) {
  let SharedCounterRoom(sluice, a, b, c, _, _, _) = room
  use a_value <- result.try(sharedcounter_value(a, "A"))
  use b_value <- result.try(sharedcounter_value(b, "B"))
  use c_value <- result.try(sharedcounter_value(c, "C"))
  Ok(SharedCounterRoomSnapshot(
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
    Error(_) ->
      Error("the G-counter handle at replica " <> replica <> " is invalid")
    Ok(value) -> Ok(value)
  }
}

fn pncounter_value(
  counter: watershed.PnCounter,
  replica: String,
) -> Result(Int, String) {
  case watershed.pn_counter_value(counter) {
    Error(_) ->
      Error("the PN-counter handle at replica " <> replica <> " is invalid")
    Ok(value) -> Ok(value)
  }
}

fn sharedcounter_value(
  counter: watershed.SharedCounter,
  replica: String,
) -> Result(Int, String) {
  case watershed.counter_value(counter) {
    Error(_) ->
      Error("the SharedCounter handle at replica " <> replica <> " is invalid")
    Ok(value) -> Ok(value)
  }
}
