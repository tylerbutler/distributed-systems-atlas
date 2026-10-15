import assert from "node:assert/strict";
import {
  add,
  createGCounter,
  createGCounterRoom,
  createMvRegister,
  createOrSet,
  createPNCounter,
  createPNCounterRoom,
  createSharedCounterRoom,
  createSetRoom,
  createRegisterDemoRoom,
  createMapRoom,
  createRemainingDemoRoom,
  createMoveComparison,
  stageMoveComparison,
  deliverMoveComparison,
  createTextComparison,
  stageTextComparison,
  deliverTextComparison,
  stageRemainingDemoRace,
  deliverRemainingDemo,
  acquireRemainingQueueJob,
  completeRemainingQueueJob,
  releaseRemainingQueueJob,
  volunteerRemainingTask,
  disconnectRemainingTaskClient,
  completeRemainingTask,
  proposeRemainingPact,
  acceptRemainingPact,
  disconnectRemainingPactClient,
  deliverGCounterRace,
  deliverPNCounterOperations,
  deliverSharedCounterOperations,
  deliverSetOperations,
  deliverRegisterDemo,
  deliverMapOperations,
  incrementGCounter,
  incrementGCounterRoom,
  inspect,
  inspectGCounter,
  inspectPNCounter,
  merge,
  mergeGCounter,
  mergePNCounter,
  remove,
  resendGCounterComponent,
  stageGCounterRace,
  stagePNCounterRace,
  stageSharedCounterRace,
  stageSetRace,
  stageRegisterDemoRace,
  stageMapRace,
  updatePNCounter,
  updatePNCounterRoom,
  write,
} from "@atlas/toolkit";

const unwrap = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};

for (const reverse of [false, true]) {
  const move = unwrap(createMoveComparison());
  assert.deepEqual(move.view.clients.map(({ id }) => id), ["A", "B", "C"]);
  for (const client of move.view.clients) {
    assert.deepEqual(client.records, [
      { id: "bridge", value: "open" },
      { id: "weir", value: "open" },
      { id: "north-gate", value: "open" },
    ]);
  }
  unwrap(stageMoveComparison(move.room));
  const moved = unwrap(deliverMoveComparison(move.room, reverse)).view;
  assert.equal(moved.phase, "delivered");
  for (const client of moved.clients) {
    assert.deepEqual(client.records, [
      { id: "weir", value: "blocked" },
      { id: "bridge", value: "open" },
      { id: "north-gate", value: "open" },
    ]);
  }
  const text = unwrap(createTextComparison());
  assert.deepEqual(text.view.clients.map(({ id }) => id), ["A", "B", "C"]);
  for (const client of text.view.clients) {
    assert.equal(client.crdt, "The weir is clear.");
    assert.equal(client.ot, client.crdt);
  }
  unwrap(stageTextComparison(text.room));
  const edited = unwrap(deliverTextComparison(text.room, reverse)).view;
  assert.equal(edited.phase, "delivered");
  for (const client of edited.clients) {
    assert.equal(client.crdt, "The still calm weir is clear.");
    assert.equal(client.ot, reverse ? "The calm still weir is clear." : client.crdt);
  }
}

const red = unwrap(write(unwrap(createMvRegister("A")), "red"));
const blue = unwrap(write(unwrap(createMvRegister("B")), "blue"));
const siblings = unwrap(merge(red.state, blue.operation));
assert.deepEqual(unwrap(inspect(siblings)).values, ["blue", "red"]);
const green = unwrap(write(siblings, "green"));
assert.deepEqual(unwrap(inspect(unwrap(merge(blue.state, green.operation)))).values, ["green"]);

const first = unwrap(add(unwrap(createOrSet("A")), "beacon"));
const peer = unwrap(merge(unwrap(createOrSet("B")), first.operation));
const removed = unwrap(remove(first.state, "beacon"));
const concurrent = unwrap(add(peer, "beacon"));
const delivered = unwrap(merge(concurrent.state, removed.operation));
const replayed = unwrap(merge(delivered, first.operation));
assert.deepEqual(unwrap(inspect(replayed)), unwrap(inspect(delivered)));
assert.deepEqual(unwrap(inspect(replayed)).values, ["beacon"]);
assert.deepEqual(replayed.entries, [{ value: "beacon", tags: [{ replicaId: "B", counter: 2 }] }]);
assert.deepEqual(replayed.tombstones, [{ replicaId: "A", counter: 1 }]);

const countA = unwrap(incrementGCounter(unwrap(createGCounter("A")), 7));
const countB = unwrap(incrementGCounter(unwrap(createGCounter("B")), 3));
const mergedA = unwrap(mergeGCounter(countA.state, countB.operation));
const mergedB = unwrap(mergeGCounter(countB.state, countA.operation));
assert.equal(unwrap(inspectGCounter(mergedA)).value, unwrap(inspectGCounter(mergedB)).value);
assert.deepEqual(unwrap(inspectGCounter(mergedA)).counts, unwrap(inspectGCounter(mergedB)).counts);
assert.deepEqual(unwrap(inspectGCounter(mergedA)).counts, [
  { replicaId: "A", count: 7 },
  { replicaId: "B", count: 3 },
]);
assert.equal(unwrap(inspectGCounter(unwrap(mergeGCounter(mergedA, countB.operation)))).value, 10);
assert.equal(incrementGCounter(mergedA, -1).ok, false);

const addedBirds = unwrap(updatePNCounter(unwrap(createPNCounter("A")), 3));
const correctedBirds = unwrap(updatePNCounter(unwrap(createPNCounter("B")), -1));
const pnA = unwrap(mergePNCounter(addedBirds.state, correctedBirds.operation));
const pnB = unwrap(mergePNCounter(correctedBirds.state, addedBirds.operation));
const pnAView = unwrap(inspectPNCounter(pnA));
const pnBView = unwrap(inspectPNCounter(pnB));
assert.equal(pnAView.value, pnBView.value);
assert.deepEqual(pnAView.positive, pnBView.positive);
assert.deepEqual(pnAView.negative, pnBView.negative);
assert.deepEqual(pnAView.positive, [
  { replicaId: "A", count: 3 },
]);
assert.deepEqual(pnAView.negative, [
  { replicaId: "B", count: 1 },
]);
assert.equal(unwrap(inspectPNCounter(unwrap(mergePNCounter(pnA, correctedBirds.operation)))).value, 2);

const pnRoom = unwrap(createPNCounterRoom()).room;
const stagedPNRoom = unwrap(stagePNCounterRace(pnRoom));
assert.deepEqual(stagedPNRoom.view.replicas.map(({ value }) => value), [13, 9, 10]);
assert.equal(stagedPNRoom.view.pending, true);
const deliveredPNRoom = unwrap(deliverPNCounterOperations(pnRoom));
assert.deepEqual(deliveredPNRoom.view.replicas.map(({ value }) => value), [12, 12, 12]);
assert.equal(deliveredPNRoom.view.pending, false);
assert.ok(deliveredPNRoom.deliveries.length >= 3);
const directPNRoom = unwrap(createPNCounterRoom()).room;
assert.deepEqual(
  unwrap(updatePNCounterRoom(directPNRoom, "C", -3)).view.replicas.map(({ value }) => value),
  [10, 10, 7],
);

const directRoom = unwrap(createGCounterRoom()).room;
const direct = unwrap(incrementGCounterRoom(directRoom, "C", 3));
assert.deepEqual(direct.view.replicas.map(({ value }) => value), [0, 0, 3]);
assert.equal(direct.view.pending, true);
assert.deepEqual(
  unwrap(deliverGCounterRace(directRoom)).view.replicas.map(({ value }) => value),
  [3, 3, 3],
);
assert.equal(incrementGCounterRoom(directRoom, "D", 1).ok, false);
assert.equal(incrementGCounterRoom(directRoom, "A", 0).ok, false);

const sharedRoom = unwrap(createSharedCounterRoom()).room;
const stagedSharedRoom = unwrap(stageSharedCounterRace(sharedRoom));
assert.deepEqual(stagedSharedRoom.view.replicas.map(({ value }) => value), [13, 9, 10]);
assert.equal(stagedSharedRoom.view.pending, true);
const deliveredSharedRoom = unwrap(deliverSharedCounterOperations(sharedRoom));
assert.deepEqual(deliveredSharedRoom.view.replicas.map(({ value }) => value), [12, 12, 12]);
assert.equal(deliveredSharedRoom.view.pending, false);
assert.equal(deliveredSharedRoom.deliveries.length, 6);

for (const [kind, expected] of [
  ["g-set", [["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"]]],
  ["two-p-set", [[], [], []]],
  ["or-set", [["Eagle Creek"], ["Eagle Creek"], ["Eagle Creek"]]],
]) {
  const setRoom = unwrap(createSetRoom(kind)).room;
  unwrap(stageSetRace(setRoom));
  assert.deepEqual(
    unwrap(deliverSetOperations(setRoom)).view.replicas.map(({ values }) => values),
    expected,
  );
}

for (const [kind, expected] of [
  ["lww-register", [["Trail closed"], ["Trail closed"], ["Trail closed"]]],
  ["mv-register", [["Trail closed", "Trail open"], ["Trail closed", "Trail open"], ["Trail closed", "Trail open"]]],
]) {
  const registerRoom = unwrap(createRegisterDemoRoom(kind)).room;
  unwrap(stageRegisterDemoRace(registerRoom));
  assert.deepEqual(
    unwrap(deliverRegisterDemo(registerRoom)).view.replicas.map(({ values }) => values),
    expected,
  );
}
const collectionRoom = unwrap(createRegisterDemoRoom("register-map")).room;
unwrap(stageRegisterDemoRace(collectionRoom));
assert.deepEqual(unwrap(deliverRegisterDemo(collectionRoom)).view.versions, [
  "Trail open",
  "Trail closed",
]);

for (const [kind, expected] of [
  ["shared-map", [
    { key: "bridge-status", value: "Inspection due" },
    { key: "gate-status", value: "Trail closed" },
  ]],
  ["lww-map", [{ key: "gate-status", value: "Trail closed" }]],
  ["or-map", [{ key: "Eagle Creek", value: "8" }]],
  ["shared-directory", [{ key: "eagle-creek", value: "folder" }]],
]) {
  const mapRoom = unwrap(createMapRoom(kind)).room;
  unwrap(stageMapRace(mapRoom));
  assert.deepEqual(
    unwrap(deliverMapOperations(mapRoom)).view.replicas.map(({ entries }) => entries),
    [expected, expected, expected],
  );
}

const room = unwrap(createGCounterRoom()).room;
const staged = unwrap(stageGCounterRace(room));
assert.deepEqual(staged.view.replicas.map(({ value }) => value), [7, 3, 0]);
assert.equal(staged.view.pending, true);
const transported = unwrap(deliverGCounterRace(room));
assert.deepEqual(transported.view.replicas.map(({ value }) => value), [10, 10, 10]);
assert.equal(transported.view.pending, false);
assert.ok(transported.deliveries.length >= 3);
const resent = unwrap(resendGCounterComponent(room));
assert.deepEqual(resent.view.replicas.map(({ value }) => value), [10, 10, 10]);
assert.ok(resent.deliveries.length >= 3);

function remainingView(view, expected, sequenceNumber) {
  assert.deepEqual(view.replicas.map(({ id }) => id), ["A", "B", "C"]);
  assert.deepEqual(view.replicas.map(({ values }) => values), [expected, expected, expected]);
  assert.equal(view.pending, 0);
  assert.equal(view.sequenceNumber, sequenceNumber);
}

for (const [kind, initial, expected, sequenceNumber] of [
  ["sequence-crdt", ["Bridge", "Weir", "North gate"], ["Bridge", "Falls", "Marsh", "Weir", "North gate"], 0],
  ["text-crdt", ["The weir is clear."], ["The still calm weir is clear."], 2],
  ["claims", ["gate-key: unclaimed"], ["gate-key: Alice"], 3],
  ["json-ot",
    ['{"crew":["Ada","Ben"],"gauge":{"stage":24,"trend":"steady"},"site":"Mill Race"}'],
    ['{"crew":["Cy","Dot","Ada","Ben"],"gauge":{"stage":25,"trend":"steady"},"site":"Mill Race"}'], 3],
  ["rich-text-ot", ["Hello World"], ["Hello [bold] World ▲"], 2],
]) {
  const created = unwrap(createRemainingDemoRoom(kind));
  remainingView(created.view, initial, 0);
  assert.ok(unwrap(stageRemainingDemoRace(created.room)).view.pending > 0);
  remainingView(unwrap(deliverRemainingDemo(created.room)).view, expected, sequenceNumber);
  remainingView(unwrap(createRemainingDemoRoom(kind)).view, initial, 0);
}

const queue = unwrap(createRemainingDemoRoom("fifo-work-queue"));
remainingView(queue.view, [
  "Queue: inspect bridge", "Queue: clear fallen branch", "Queue: restock first-aid cache",
], 0);
for (const [act, replica] of [
  [acquireRemainingQueueJob, "A"],
  [acquireRemainingQueueJob, "B"],
  [releaseRemainingQueueJob, "A"],
  [acquireRemainingQueueJob, "C"],
  [completeRemainingQueueJob, "B"],
]) {
  unwrap(act(queue.room, replica));
  unwrap(deliverRemainingDemo(queue.room));
}
remainingView(unwrap(deliverRemainingDemo(queue.room)).view, [
  "Carol owns restock first-aid cache", "Queue: inspect bridge",
], 5);

const task = unwrap(createRemainingDemoRoom("task-manager"));
remainingView(task.view, ["dispatcher: unassigned"], 0);
for (const replica of ["A", "B", "C"]) unwrap(volunteerRemainingTask(task.room, replica));
remainingView(unwrap(deliverRemainingDemo(task.room)).view, [
  "dispatcher: Alice", "waiting: Bob, Carol",
], 3);
remainingView(unwrap(disconnectRemainingTaskClient(task.room, "A")).view, [
  "dispatcher: Bob", "waiting: Carol",
], 3);
unwrap(completeRemainingTask(task.room, "B"));
remainingView(unwrap(deliverRemainingDemo(task.room)).view, ["dispatcher: unassigned"], 4);

const pact = unwrap(createRemainingDemoRoom("pact-map"));
remainingView(pact.view, ["accepted: north-gate"], 0);
unwrap(proposeRemainingPact(pact.room, "A", "ridge-pass"));
remainingView(unwrap(deliverRemainingDemo(pact.room)).view, [
  "accepted: north-gate", "pending: ridge-pass", "needs signoff: Alice, Bob, Carol",
], 1);
unwrap(acceptRemainingPact(pact.room, "A"));
unwrap(acceptRemainingPact(pact.room, "B"));
remainingView(unwrap(deliverRemainingDemo(pact.room)).view, [
  "accepted: north-gate", "pending: ridge-pass", "needs signoff: Carol",
], 3);
remainingView(unwrap(disconnectRemainingPactClient(pact.room, "C")).view, ["accepted: ridge-pass"], 4);
console.log("Toolkit package smoke passed (generated JavaScript through @atlas/toolkit).");
