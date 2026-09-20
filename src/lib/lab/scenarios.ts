import type { CausalScenario } from "./causal-engine";

const scenarios: Record<string, CausalScenario> = {
  "dots-concurrent-add-remove": {
    id: "dots-concurrent-add-remove",
    replicas: ["A", "B"],
    initialValues: [],
  },
};

export function scenarioIds(): string[] {
  return Object.keys(scenarios).sort();
}

export function scenarioById(id: string): CausalScenario {
  const scenario = scenarios[id];
  if (!scenario) throw new Error(`Unknown lab scenario: ${id}`);
  return structuredClone(scenario);
}
