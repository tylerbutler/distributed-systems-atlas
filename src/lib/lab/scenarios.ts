import { compareVectors, immutable, type EngineScenario, type LabAction, type OrderingMode, type TraceFrame } from "./contract";
import { createEngine } from "./engine-registry";
import { acceptanceFixtures } from "./fixtures";
import { compareEvents, lamportOrder } from "./ordering-engine";
import { vectorLabel, type LabPresentation, type PresentedControl } from "./present-frame";

export interface LabScenario extends EngineScenario {
  readonly presentation: LabPresentation;
  readonly actions?: readonly LabAction[];
}

function connectionControls(frame: TraceFrame): PresentedControl[] {
  const ordered = [...frame.replicas].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  return ordered.flatMap((replica, index) => ordered.slice(index + 1).flatMap((peer): PresentedControl[] => {
    const left = replica.id;
    const right = peer.id;
    const partitioned = frame.partitions.includes(`${left}:${right}`);
    return [
      { kind: "action", label: `Partition ${left} and ${right}`, action: { type: "partition", left, right },
        reason: partitioned ? "This connection is already partitioned." : "" },
      { kind: "action", label: `Heal ${left} and ${right}`, action: { type: "heal", left, right },
        reason: partitioned ? "" : "This connection is already open." },
    ];
  }));
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
    controls.push(...connectionControls(frame));
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

const orderingFixtures = [acceptanceFixtures[0], acceptanceFixtures[1], acceptanceFixtures[2], acceptanceFixtures[3]] as const;

function fixtureActions(fixture: typeof orderingFixtures[number]): LabAction[] {
  return fixture.actions.map((action): LabAction => {
    switch (action.type) {
      case "local-event":
        return {
          type: "local-event", replica: action.input.replica, event: action.id,
          ...("value" in action.input ? { value: action.input.value } : {}),
        };
      case "send":
        return { type: "send", from: action.input.from, to: action.input.to, event: action.id, message: action.input.message };
      case "deliver":
        return { type: "deliver", message: action.input.message, event: action.id };
      case "compare-events":
        return { type: "compare-events", pairs: action.input.pairs.map(([left, right]) => [left, right]) };
      case "compare-vectors":
        return { type: "compare-vectors", left: { ...action.input.left }, right: { ...action.input.right } };
    }
  });
}

function orderingPresentation(mode: OrderingMode, actions: readonly LabAction[]): LabPresentation {
  const titles: Record<OrderingMode, string> = {
    history: "Local history lab", "partial-order": "Partial order lab",
    lamport: "Lamport clock lab", vector: "Vector clock lab",
  };
  return {
    title: titles[mode],
    instructions: "Follow the reference steps, or create local events and choose when messages arrive. Reset to restart the reference trace.",
    comparisonHeading: mode === "vector" ? "Vector comparison" : "Event comparison",
    inspectorNote: mode === "lamport"
      ? "The event graph defines causality. Scalar timestamps and replica-ID tie breaking define a separate display order."
      : mode === "vector" ? "Each clock carries one component per replica. Receive merges maxima, then increments the receiver."
        : "Local history and delivered observations are separate. Sending copies known history without adding a local event in this lesson.",
    invariantLabels: {
      localHistoryIsOrdered: "Local history is ordered",
      observationsHaveCausalPaths: "Observed events have causal paths",
      localClockIncreases: "Local clock increases",
      happensBeforeImpliesLowerTimestamp: "Causal predecessors have lower timestamps",
      vectorMatchesGraph: "Vector relations match the event graph",
      oneComponentPerReplica: "One vector component per replica",
    },
    valueLabel: (replica) => replica.value.join(", ") || "No local values",
    controls(frame) {
      const controls: PresentedControl[] = [];
      const next = actions[frame.index];
      if (next && (frame.index === 0 || JSON.stringify(frame.action) === JSON.stringify(actions[frame.index - 1]))) {
        controls.push({ kind: "action", label: `Reference step ${frame.index + 1}: ${next.type}`, action: next, reason: "" });
      }
      for (const replica of frame.replicas) {
        controls.push({
          kind: "action", label: `Local event at ${replica.id}`,
          action: { type: "local-event", replica: replica.id }, reason: "",
        });
        for (const peer of frame.replicas) {
          if (peer.id !== replica.id) controls.push({
            kind: "action", label: `Send from ${replica.id} to ${peer.id}`,
            action: { type: "send", from: replica.id, to: peer.id }, reason: "",
          });
        }
      }
      controls.push(...connectionControls(frame));
      const graph = frame.ordering?.events ?? [];
      const [left, right] = graph.slice(-2);
      if (left && right) controls.push({
        kind: "action", label: `Compare ${left.id} and ${right.id}`,
        action: { type: "compare-events", pairs: [[left.id, right.id], [right.id, left.id], [left.id, left.id]] }, reason: "",
      });
      for (const comparison of frame.ordering?.comparisons ?? []) {
        controls.push({ kind: "notice", text: `${comparison.left} / ${comparison.right}: ${comparison.relation}` });
      }
      if (mode === "lamport") controls.push({
        kind: "notice",
        text: `Total display order (timestamp, replica ID): ${
          lamportOrder(graph).map((event) => `${event.id}@${event.lamport}/${event.replica}`).join(", ") || "No events"
        }. Tie breaking is not causality. A lower timestamp does not prove happens-before.`,
      });
      if (mode === "vector") {
        controls.push({
          kind: "notice",
          text: `${frame.replicas.length} replicas need ${frame.replicas.length} components per clock. Adding one replica needs ${frame.replicas.length + 1} components per clock.`,
        });
        for (const action of actions) {
          if (action.type === "compare-vectors") controls.push({
            kind: "action", label: `Compare [${vectorLabel(action.left)}] with [${vectorLabel(action.right)}]`,
            action, reason: "",
          });
        }
        for (const comparison of frame.ordering?.vectorComparisons ?? []) controls.push({
          kind: "notice", text: `[${vectorLabel(comparison.left)}] / [${vectorLabel(comparison.right)}]: ${comparison.relation}`,
        });
      }
      return controls;
    },
    compare(frame) {
      if (mode === "vector") {
        const [left, right] = frame.replicas;
        const latest = frame.action?.type === "compare-vectors" ? frame.ordering?.vectorComparisons.at(-1) : undefined;
        if (latest) return {
          relation: latest.relation, label: `Selected vectors are ${latest.relation}`,
          evidence: `[${vectorLabel(latest.left)}]; [${vectorLabel(latest.right)}]`,
        };
        if (left?.observation !== "vector-clock" || right?.observation !== "vector-clock") return null;
        const relation = compareVectors(left.clock, right.clock);
        return {
          relation, label: `${left.id} / ${right.id}: ${relation}`,
          evidence: `${left.id} [${vectorLabel(left.clock)}]; ${right.id} [${vectorLabel(right.clock)}]`,
        };
      }
      const graph = frame.ordering?.events ?? [];
      const selected = frame.action?.type === "compare-events" ? frame.ordering?.comparisons.at(-1) : undefined;
      const scalarPair = mode === "lamport" ? graph.flatMap((left) => graph
        .filter((right) => left.lamport! < right.lamport! && compareEvents(graph, left.id, right.id) === "concurrent")
        .map((right) => [left, right] as const))[0] : undefined;
      const [left, right] = scalarPair ?? graph.slice(-2);
      if (!selected && (!left || !right)) return null;
      const a = selected?.left ?? left.id;
      const b = selected?.right ?? right.id;
      const relation = compareEvents(graph, a, b);
      return {
        relation, label: `${a} / ${b}: ${relation}`,
        evidence: mode === "lamport"
          ? "Graph paths determine this relation. Unequal scalar timestamps alone cannot distinguish happens-before from concurrency."
          : "Follow local predecessor and delivered-message edges. No path in either direction means concurrent.",
      };
    },
    announce: () => "",
    complete(frame) {
      const graph = frame.ordering?.events ?? [];
      if (mode === "vector") {
        return new Set(frame.ordering?.vectorComparisons.map((comparison) => comparison.relation)).size === 4
          ? { heading: "Four vector relations", explanation: "Every component matters. Each added replica adds a component to each clock." } : null;
      }
      if (mode === "partial-order") {
        const relations = new Set(frame.ordering?.comparisons.map((comparison) => comparison.relation));
        return (["before", "equal", "concurrent"] as const).every((relation) => relations.has(relation))
          ? { heading: "Paths define the partial order", explanation: "Some events have a causal path; others remain concurrent despite button order." } : null;
      }
      const concurrent = graph.flatMap((left) => graph
        .filter((right) => compareEvents(graph, left.id, right.id) === "concurrent")
        .map((right) => [left, right] as const));
      if (mode === "lamport") {
        return graph.some((event) => event.kind === "receive")
          && concurrent.some(([left, right]) => left.lamport === right.lamport)
          && concurrent.some(([left, right]) => left.lamport !== right.lamport)
          ? {
            heading: "Scalar order is not causality",
            explanation: "Concurrent events can have equal or unequal timestamps. Replica-ID tie breaking orders the display, not the event graph.",
          } : null;
      }
      return concurrent.some(([left, right]) => left.kind === "receive" && right.kind === "local"
        && left.predecessors.some((id) => graph.some((source) => source.id === id
          && source.replica === right.replica && compareEvents(graph, source.id, right.id) === "before")))
        ? { heading: "Delivery is not global knowledge", explanation: "The receiver learns the sent history, not later source events." } : null;
    },
  };
}

const orderingModes: OrderingMode[] = ["history", "partial-order", "lamport", "vector"];
const orderingScenarios: LabScenario[] = orderingFixtures.map((fixture, index) => {
  const actions = fixtureActions(fixture);
  const replicas = new Set<string>();
  for (const action of actions) {
    if (action.type === "local-event") replicas.add(action.replica);
    if (action.type === "send") { replicas.add(action.from); replicas.add(action.to); }
    if (action.type === "compare-vectors") {
      [...Object.keys(action.left), ...Object.keys(action.right)].forEach((id) => replicas.add(id));
    }
  }
  const orderingMode = orderingModes[index];
  return {
    id: fixture.id, kind: "ordering", orderingMode, replicas: [...replicas].sort(), initialValues: [],
    actions, presentation: orderingPresentation(orderingMode, actions),
  };
});

const structureScenarios: LabScenario[] = [acceptanceFixtures[5], acceptanceFixtures[6]].map((fixture) => {
  const kind = fixture.id.startsWith("mv-register") ? "mv-register" : "or-set";
  const actions = fixture.actions.map((action): LabAction => {
    switch (action.type) {
      case "write":
      case "add":
      case "remove":
        return { type: action.type, replica: action.input.replica, value: action.input.value };
      case "deliver":
      case "duplicate":
        return { type: action.type, message: action.input.message };
      case "partition":
      case "heal":
        return { type: action.type, left: action.input.left, right: action.input.right };
    }
  });
  const register = kind === "mv-register";
  return {
    id: fixture.id, kind, replicas: ["A", "B"], initialValues: [], actions,
    presentation: {
      title: register ? "Multi-value register lab" : "Observed-remove set lab",
      instructions: "Follow the reference steps to reproduce the article. Reset before a new run. Delivery controls determine which queued delta arrives.",
      comparisonHeading: "Causal context comparison",
      inspectorNote: register
        ? "Each sibling retains its authored version. The merged context does not replace sibling versions."
        : "Watershed uses a set-wide allocation counter: the concurrent B addition is B:2. Context shows tag maxima, not a gap-free vector clock.",
      invariantLabels: {
        uniqueTags: "Unique tags",
        removeTargetsOnlyObservedDots: "Remove targets only observed dots",
        concurrentAddSurvives: "Concurrent add survives",
        removedDotsStayRemoved: "Removed dots stay removed",
        converged: "Converged",
      },
      valueLabel: (replica) => replica.value.join(", ") || (register ? "Empty register" : "Empty set"),
      controls(frame) {
        const controls: PresentedControl[] = [];
        const next = actions[frame.index];
        if (next && (frame.index === 0 || JSON.stringify(frame.action) === JSON.stringify(actions[frame.index - 1]))) {
          controls.push({ kind: "action", label: `Reference step ${frame.index + 1}: ${next.type}`, action: next, reason: "" });
        }
        for (const replica of frame.replicas) {
          if (register) {
            for (const value of ["red", "blue", "green"]) controls.push({
              kind: "action", label: `Write ${value} at ${replica.id}`,
              action: { type: "write", replica: replica.id, value }, reason: "",
            });
          } else {
            for (const type of ["add", "remove"] as const) controls.push({
              kind: "action", label: `${type === "add" ? "Add" : "Remove"} beacon at ${replica.id}`,
              action: { type, replica: replica.id, value: "beacon" },
              reason: type === "remove" && !replica.value.includes("beacon") ? "No beacon is visible at this replica." : "",
            });
          }
        }
        return [...controls, ...connectionControls(frame)];
      },
      compare: () => null,
      announce: () => "",
      complete(frame, history) {
        // The conclusion describes the reference experiment, including its intermediate evidence.
        const referenceRun = history.length === actions.length + 1
          && history.slice(1).every((entry, index) => JSON.stringify(entry.action) === JSON.stringify(actions[index]));
        if (!referenceRun || !frame.invariants.converged) return null;
        if (register && frame.replicas.every((replica) =>
          replica.observation === "mv-register" && replica.siblings.length === 1
          && replica.siblings[0].value === "green"
          && replica.siblings[0].version.A === 2 && replica.siblings[0].version.B === 1)) {
          return {
            heading: "An observed write replaces both siblings",
            explanation: "Red and blue coexisted before A wrote green with context A:2, B:1. Both replicas now retain only green.",
          };
        }
        if (!register && frame.replicas.every((replica) =>
          replica.observation === "or-set" && replica.members.length === 1
          && replica.members[0].value === "beacon" && replica.members[0].dots.length === 1
          && replica.members[0].dots[0].replica === "B" && replica.members[0].dots[0].counter === 2
          && replica.members[0].removed.some((dot) => dot.replica === "A" && dot.counter === 1))) {
          return {
            heading: "The concurrent add survives stale replay",
            explanation: "Both replicas retain B:2 and the removal of A:1. Replaying the old A:1 delta did not restore that addition.",
          };
        }
        return null;
      },
    },
  };
});

const scenarioDefinitions: readonly LabScenario[] = [
  ...orderingScenarios,
  ...structureScenarios,
  {
    id: "dots-concurrent-add-remove",
    kind: "dots",
    replicas: ["A", "B"],
    initialValues: [],
    presentation: dotsPresentation,
  },
];

export function buildScenarioRegistry(
  definitions: readonly LabScenario[],
): Readonly<Record<string, LabScenario>> {
  const registry = Object.create(null) as Record<string, LabScenario>;
  for (const scenario of definitions) {
    if (Object.hasOwn(registry, scenario.id)) {
      throw new Error(`Duplicate scenario ID: ${scenario.id}`);
    }
    registry[scenario.id] = scenario;
  }
  return immutable(registry);
}

const scenarios = buildScenarioRegistry(scenarioDefinitions);

export function scenarioIds(): string[] {
  return Object.keys(scenarios).sort();
}

export function scenarioById(id: string): LabScenario {
  if (!Object.hasOwn(scenarios, id)) throw new Error(`Unknown lab scenario: ${id}`);
  const { presentation, ...config } = scenarios[id];
  return { ...structuredClone(config), presentation };
}

/** The same recorded frames can drive diagrams, static fallbacks, and live reference replays. */
export function scenarioTrace(id: string): readonly TraceFrame[] {
  const scenario = scenarioById(id);
  const engine = createEngine(scenario);
  for (const action of scenario.actions ?? []) {
    const result = engine.dispatch(action);
    if ("message" in result) throw new Error(`Cannot replay ${id}: ${result.message}`);
  }
  return engine.history();
}
