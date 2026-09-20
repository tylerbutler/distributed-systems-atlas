import { createCausalEngine } from "./causal-engine";
import { createOrderingEngine } from "./ordering-engine";
import { createWatershedMvRegister } from "./adapters/watershed-mv-register";
import { createWatershedOrSet } from "./adapters/watershed-or-set";
import type { EngineKind, EngineScenario, SimulationEngine } from "./contract";

const engines: Partial<Record<EngineKind, (scenario: EngineScenario) => SimulationEngine>> = {
  dots: createCausalEngine,
  ordering: createOrderingEngine,
  "mv-register": createWatershedMvRegister,
  "or-set": createWatershedOrSet,
};

export function createEngine(scenario: EngineScenario): SimulationEngine {
  const factory = Object.hasOwn(engines, scenario.kind) ? engines[scenario.kind] : undefined;
  if (!factory) throw new Error(`No engine registered for kind: ${scenario.kind}`);
  return factory(scenario);
}
