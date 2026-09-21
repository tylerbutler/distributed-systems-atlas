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
  deliverGCounterRace,
  deliverPNCounterOperations,
  deliverSharedCounterOperations,
  deliverSetOperations,
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
  updatePNCounter,
  updatePNCounterRoom,
  write,
} from "@atlas/toolkit";

const unwrap = (result) => {
  assert.equal(result.ok, true, JSON.stringify(result));
  return result.value;
};

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
console.log("Toolkit package smoke passed (generated JavaScript through @atlas/toolkit).");
