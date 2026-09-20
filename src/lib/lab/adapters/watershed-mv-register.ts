import type { EngineScenario, Observation, SimulationEngine } from "../contract";
import { createWatershedEngine, tagKey, vector } from "./watershed-engine";

type MvObservation = Extract<Observation, { observation: "mv-register" }>;

export function createWatershedMvRegister(config: EngineScenario): SimulationEngine<MvObservation> {
  return createWatershedEngine(config, "mv-register", (state, authored, replicas) => {
    if (state.kind !== "mv-register") throw new Error("expected Watershed MV-register state");
    // A merged clock is not a sibling's birth vector. Retain the package's authored clocks.
    const versions = new Map(authored.flatMap(({ delta }) => delta.kind === "mv-register"
      ? delta.entries.map((entry) => [tagKey(entry.tag), vector(delta.clock, replicas)] as const) : []));
    return {
      observation: "mv-register",
      siblings: state.entries.map((entry) => {
        const version = versions.get(tagKey(entry.tag));
        if (!version) throw new Error(`missing authored version for ${tagKey(entry.tag)}`);
        return { value: entry.value, version };
      }),
      context: vector(state.clock, replicas),
    };
  });
}
