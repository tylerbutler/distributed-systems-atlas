import assert from "node:assert/strict";
import {
  add,
  createGCounter,
  createGCounterRoom,
  createMvRegister,
  createOrSet,
  deliverGCounterRace,
  incrementGCounter,
  inspect,
  inspectGCounter,
  merge,
  mergeGCounter,
  remove,
  resendGCounterComponent,
  stageGCounterRace,
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
