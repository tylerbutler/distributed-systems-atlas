import type { Tag } from "@atlas/toolkit";
import type { Dot, EngineScenario, Observation, SimulationEngine } from "../contract";
import { createWatershedEngine, tagKey, vector } from "./watershed-engine";

type SetObservation = Extract<Observation, { observation: "or-set" }>;
const dot = (tag: Tag): Dot => ({ replica: tag.replicaId, counter: tag.counter });

export function createWatershedOrSet(config: EngineScenario): SimulationEngine<SetObservation> {
  return createWatershedEngine(config, "or-set", (state, authored, replicas) => {
    if (state.kind !== "or-set") throw new Error("expected Watershed OR-set state");
    // Tombstones carry tags, not values. Authored deltas supply display labels only.
    const labels = new Map(authored.flatMap(({ delta }) => delta.kind === "or-set"
      ? delta.entries.flatMap((entry) => entry.tags.map((tag) => [tagKey(tag), entry.value] as const)) : []));
    const members = new Map<string, { value: string; dots: Dot[]; removed: Dot[] }>(
      state.entries.map((entry) => [entry.value, { value: entry.value, dots: entry.tags.map(dot), removed: [] }]),
    );
    for (const tag of state.tombstones) {
      const value = labels.get(tagKey(tag));
      if (value === undefined) throw new Error(`missing authored value for ${tagKey(tag)}`);
      const member = members.get(value) ?? { value, dots: [], removed: [] };
      member.removed.push(dot(tag));
      members.set(value, member);
    }
    return {
      observation: "or-set",
      members: [...members.keys()].sort().map((value) => members.get(value)!),
      context: vector([...state.entries.flatMap((entry) => entry.tags), ...state.tombstones], replicas),
    };
  });
}
