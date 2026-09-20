import type { CausalRelation, Dot, LabAction, Observation, ReplicaView, TraceFrame, VersionVector } from "./contract";

export interface PresentedDetail {
  label: string;
  value: string;
}

export type PresentedControl =
  | { kind: "action"; label: string; action: LabAction; reason: string }
  | { kind: "notice"; text: string };

export interface PresentedReplica {
  id: string;
  stationShape: "circle" | "diamond" | "hexagon";
  details: PresentedDetail[];
  emptyLabel: string | null;
}

export interface PresentedMessage {
  id: string;
  from: string;
  to: string;
  routeLabel: string;
  payloadLabel: string;
  details: PresentedDetail[];
  blocked: boolean;
}

export interface PresentedFrame {
  index: number;
  title: string;
  instructions: string;
  comparisonHeading: string;
  inspectorNote: string;
  controls: readonly PresentedControl[];
  actionLabel: string;
  explanation: string;
  announcement: string;
  outcome: { heading: string; explanation: string } | null;
  replicas: PresentedReplica[];
  messages: PresentedMessage[];
  comparison: { relation: CausalRelation; label: string; evidence: string } | null;
  links: Array<{ left: string; right: string; partitioned: boolean }>;
  invariants: Array<{ id: string; label: string; passed: boolean }>;
}

export interface LabPresentation {
  readonly title: string;
  readonly instructions: string;
  readonly comparisonHeading: string;
  readonly inspectorNote: string;
  readonly invariantLabels: Readonly<Record<string, string>>;
  valueLabel(replica: ReplicaView): string;
  controls(frame: TraceFrame, history: readonly TraceFrame[]): readonly PresentedControl[];
  compare(frame: TraceFrame): PresentedFrame["comparison"];
  announce(frame: TraceFrame): string;
  complete(frame: TraceFrame, history: readonly TraceFrame[]): PresentedFrame["outcome"];
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function vectorLabel(vector: VersionVector): string {
  return Object.keys(vector).sort(lexical).map((id) => `${id}:${vector[id]}`).join(", ") || "Empty vector";
}

function dotsLabel(dots: readonly Dot[]): string {
  return [...dots]
    .sort((left, right) => lexical(left.replica, right.replica) || left.counter - right.counter)
    .map((dot) => `${dot.replica}:${dot.counter}`).join(", ") || "No live dots";
}

function observationDetails(record: Observation, target: "replica" | "message"): PresentedDetail[] {
  switch (record.observation) {
    case "history":
      return [
        { label: "Local history", value: record.events.map((event) => event.id).join(", ") || "No local events" },
        { label: "Observed events", value: record.observed.join(", ") || "No events observed" },
        { label: "Predecessors", value: record.events.map((event) =>
          `${event.id}: ${event.predecessors.join(", ") || "none"}`).join("; ") || "No predecessors" },
      ];
    case "scalar-clock":
      return [{ label: "Scalar clock", value: String(record.clock) }];
    case "vector-clock":
      return [
        { label: "Clock", value: vectorLabel(record.clock) },
        { label: "Vector size", value: `${Object.keys(record.clock).length} components per clock` },
      ];
    case "dots":
      return [
        { label: "Live dots", value: dotsLabel(record.dots) },
        ...(target === "replica" ? [{ label: "Clock", value: vectorLabel(record.clock) }] : []),
        { label: "Causal context", value: vectorLabel(record.context) },
      ];
    case "mv-register":
      return [
        { label: "Register siblings", value: record.siblings.map((sibling) =>
          `${sibling.value} [${vectorLabel(sibling.version)}]`).join("; ") || "No register siblings" },
        { label: "Causal context", value: vectorLabel(record.context) },
      ];
    case "or-set":
      return [
        { label: "Set membership", value: record.members.map((member) =>
          `${member.value} [${dotsLabel(member.dots)}]`).join("; ") || "Empty set" },
        { label: "Removed dots", value: record.members.map((member) =>
          `${member.value} [${member.removed.length ? dotsLabel(member.removed) : "none"}]`).join("; ") || "No removed dots" },
        { label: "Causal context", value: vectorLabel(record.context) },
      ];
  }
}

function hasObservedEvents(record: Observation): boolean {
  switch (record.observation) {
    case "history": return record.events.length > 0 || record.observed.length > 0;
    case "scalar-clock": return record.clock !== 0;
    case "vector-clock": return Object.values(record.clock).some((count) => count !== 0);
    case "dots":
    case "mv-register":
    case "or-set": return Object.values(record.context).some((count) => count !== 0);
  }
}

export function presentFrame(
  frame: TraceFrame,
  history: readonly TraceFrame[],
  presentation: LabPresentation,
): PresentedFrame {
  const ordered = [...frame.replicas].sort((left, right) => lexical(left.id, right.id));
  const blocked = (left: string, right: string): boolean =>
    frame.partitions.includes([left, right].sort(lexical).join(":"));
  const comparison = presentation.compare(frame);
  const selectedHistory = history.filter((entry) => entry.index <= frame.index);
  return {
    index: frame.index,
    title: presentation.title,
    instructions: presentation.instructions,
    comparisonHeading: presentation.comparisonHeading,
    inspectorNote: presentation.inspectorNote,
    controls: presentation.controls(frame, selectedHistory),
    actionLabel: frame.actionLabel,
    explanation: frame.explanation,
    announcement: [
      presentation.announce(frame), frame.explanation, comparison ? `${comparison.label}.` : "",
    ].filter(Boolean).join(" "),
    outcome: presentation.complete(frame, selectedHistory),
    replicas: ordered.map((replica) => ({
      id: replica.id,
      stationShape: replica.id === "A" ? "circle" : replica.id === "B" ? "diamond" : "hexagon",
      details: [
        { label: "Visible value", value: presentation.valueLabel(replica) },
        ...observationDetails(replica, "replica"),
        ...(frame.ordering && (replica.observation === "scalar-clock" || replica.observation === "vector-clock") ? [{
          label: "Local history",
          value: frame.ordering.events.filter((event) => event.replica === replica.id).map((event) =>
            `${event.id}@${event.lamport ?? `[${vectorLabel(event.vector ?? {})}]`}`).join(", ") || "No local events",
        }, {
          label: "Predecessors",
          value: frame.ordering.events.filter((event) => event.replica === replica.id).map((event) =>
            `${event.id}: ${event.predecessors.join(", ") || "none"}`).join("; ") || "No predecessors",
        }] : []),
      ],
      emptyLabel: hasObservedEvents(replica) ? null : "No events observed",
    })),
    messages: frame.messages.map((message) => {
      const observations = observationDetails(message, "message");
      const parts = message.id.split(":");
      const idParts = parts[1] === message.from && parts[2] === message.to
        ? [parts[0], ...parts.slice(3)] : parts;
      return {
        id: message.id,
        from: message.from,
        to: message.to,
        routeLabel: `${idParts.join(" ")} from ${message.from} to ${message.to}`,
        payloadLabel: [message.kind, ...observations.map(({ label, value }) => `${label.toLowerCase()}: ${value}`)].join("; "),
        details: [
          { label: "Message ID", value: message.id },
          { label: "Kind", value: message.kind },
          ...observations,
        ],
        blocked: blocked(message.from, message.to),
      };
    }),
    comparison,
    links: ordered.flatMap((replica, index) => ordered.slice(index + 1).map((peer) => ({
      left: replica.id, right: peer.id, partitioned: blocked(replica.id, peer.id),
    }))),
    invariants: Object.entries(frame.invariants).map(([id, passed]) => ({
      id, label: presentation.invariantLabels[id] ?? id, passed,
    })),
  };
}
