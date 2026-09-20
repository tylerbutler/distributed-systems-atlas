import { compareVectors, immutable, type EngineScenario, type TraceFrame } from "./contract";
import { vectorLabel, type LabPresentation, type PresentedControl } from "./present-frame";

export interface LabScenario extends EngineScenario {
  readonly presentation: LabPresentation;
}

export const dotsPresentation: LabPresentation = immutable({
  title: "Causal lab",
  instructions: "Add or remove beacon, then choose which delta arrives. The stations only learn from messages you deliver.",
  comparisonHeading: "Vector comparison",
  inspectorNote: "Engine-private removal records are not exposed by this trace.",
  invariantLabels: {
    uniqueDots: "Unique dots",
    removedDotsStayRemoved: "Removed dots stay removed",
    converged: "Converged",
  },
  valueLabel: (replica) => replica.value.join(", ") || "Empty set",
  controls(frame) {
    const ordered = [...frame.replicas].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    const controls: PresentedControl[] = ordered.flatMap((replica) =>
      (["add", "remove"] as const).map((type) => ({
        kind: "action" as const,
        label: `${type === "add" ? "Add" : "Remove"} beacon at ${replica.id}`,
        action: { type, replica: replica.id, value: "beacon" },
        reason: type === "remove" && !replica.value.includes("beacon") ? "No beacon is visible at this replica." : "",
      })));
    for (const [index, replica] of ordered.entries()) {
      for (const peer of ordered.slice(index + 1)) {
        const left = replica.id;
        const right = peer.id;
        const partitioned = frame.partitions.includes(`${left}:${right}`);
        controls.push(
          { kind: "action", label: `Partition ${left} and ${right}`, action: { type: "partition", left, right },
            reason: partitioned ? "This connection is already partitioned." : "" },
          { kind: "action", label: `Heal ${left} and ${right}`, action: { type: "heal", left, right },
            reason: partitioned ? "" : "This connection is already open." },
        );
      }
    }
    return controls;
  },
  compare(frame) {
    const [left, right] = [...frame.replicas].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
    if (!left || !right || left.observation !== "dots" || right.observation !== "dots") return null;
    const relation = compareVectors(left.clock, right.clock);
    return {
      relation,
      label: relation === "equal" || relation === "concurrent"
        ? `${left.id} and ${right.id} are ${relation}` : `${left.id} is ${relation} ${right.id}`,
      evidence: `${left.id} [${vectorLabel(left.clock)}]; ${right.id} [${vectorLabel(right.clock)}]`,
    };
  },
  announce(frame) {
    const action = frame.action;
    if (action?.type !== "add") return "";
    const replica = frame.replicas.find((entry) => entry.id === action.replica);
    return replica?.observation === "dots" ? `${replica.id} created dot ${replica.id}:${replica.clock[replica.id]}.` : "";
  },
  complete(frame, history) {
    const atA = (entry: TraceFrame) => entry.replicas.find((replica) => replica.id === "A");
    const observedRemove = history.slice(1).some((entry, index) => {
      const replica = atA(entry);
      const previous = atA(history[index]);
      return entry.action?.type === "remove" && entry.action.value === "beacon" && entry.action.replica === "A"
        && replica?.observation === "dots" && replica.context.B === 0
        && previous?.observation === "dots" && previous.dots.some((dot) => dot.replica === "A" && dot.counter === 1);
    });
    const unobservedRemovalAtAdd = history.some((entry) =>
      entry.action?.type === "add" && entry.action.value === "beacon" && entry.action.replica === "B"
      && entry.replicas.some((replica) => replica.id === "B" && replica.observation === "dots" && replica.clock.B === 1
        && replica.dots.some((dot) => dot.replica === "A" && dot.counter === 1)));
    // Healing alone does not earn the lesson; both states must retain only B:1.
    return observedRemove && unobservedRemovalAtAdd && frame.invariants.converged
      && frame.replicas.every((replica) =>
        replica.observation === "dots" && replica.value.includes("beacon") && replica.dots.length === 1
        && replica.dots[0].replica === "B" && replica.dots[0].counter === 1)
      ? {
        heading: "The new B dot survives",
        explanation: "Both replicas retain B:1. A removed the dot it had observed, not B's concurrent add.",
      } : null;
  },
});

const scenarios: Readonly<Record<string, LabScenario>> = immutable({
  "dots-concurrent-add-remove": {
    id: "dots-concurrent-add-remove",
    kind: "dots",
    replicas: ["A", "B"],
    initialValues: [],
    presentation: dotsPresentation,
  },
});

export function scenarioIds(): string[] {
  return Object.keys(scenarios).sort();
}

export function scenarioById(id: string): LabScenario {
  if (!Object.hasOwn(scenarios, id)) throw new Error(`Unknown lab scenario: ${id}`);
  const { presentation, ...config } = scenarios[id];
  return { ...structuredClone(config), presentation };
}
