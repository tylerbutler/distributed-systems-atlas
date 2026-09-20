import assert from "node:assert/strict";
import { add, createMvRegister, createOrSet, inspect, merge, remove, write } from "@atlas/toolkit";

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
console.log("Toolkit package smoke passed (generated JavaScript through @atlas/toolkit).");
