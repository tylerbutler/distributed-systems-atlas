import { compareVectors, type CausalRelation, type Dot, type TraceFrame, type VersionVector } from "./contract";

export interface PresentedReplica {
  id: string;
  stationShape: "circle" | "diamond" | "hexagon";
  valueLabel: string;
  clockLabel: string;
  dotLabels: string[];
  dotsLabel: string;
  contextLabel: string;
  hasObservedEvents: boolean;
  canRemoveBeacon: boolean;
}

export interface PresentedMessage {
  id: string;
  from: string;
  to: string;
  routeLabel: string;
  payloadLabel: string;
  kindLabel: string;
  dotLabels: string[];
  dotsLabel: string;
  contextLabel: string;
  blocked: boolean;
}

export interface PresentedFrame {
  index: number;
  actionLabel: string;
  explanation: string;
  announcement: string;
  replicas: PresentedReplica[];
  messages: PresentedMessage[];
  /** The first two replicas in ID order; a single replica has no comparison. */
  comparison: {
    relation: CausalRelation;
    label: string;
    evidence: string;
  } | null;
  links: Array<{ left: string; right: string; partitioned: boolean }>;
  invariants: Array<{ id: string; label: string; passed: boolean }>;
}

function lexical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function vectorLabel(vector: VersionVector): string {
  return Object.keys(vector).sort(lexical).map((id) => `${id}:${vector[id]}`).join(", ") || "Empty vector";
}

function dotLabels(dots: readonly Dot[]): string[] {
  return [...dots]
    .sort((left, right) => lexical(left.replica, right.replica) || left.counter - right.counter)
    .map((dot) => `${dot.replica}:${dot.counter}`);
}

export function presentFrame(frame: TraceFrame): PresentedFrame {
  const ordered = [...frame.replicas].sort((left, right) => lexical(left.id, right.id));
  const blocked = (left: string, right: string): boolean =>
    frame.partitions.includes([left, right].sort(lexical).join(":"));
  const replicas: PresentedReplica[] = ordered.map((replica) => {
    const dots = dotLabels(replica.dots);
    return {
      id: replica.id,
      stationShape: replica.id === "A" ? "circle" : replica.id === "B" ? "diamond" : "hexagon",
      valueLabel: replica.value.join(", ") || "Empty set",
      clockLabel: vectorLabel(replica.clock),
      dotLabels: dots,
      dotsLabel: dots.join(", ") || "No live dots",
      contextLabel: vectorLabel(replica.context),
      hasObservedEvents: Object.values(replica.context).some((count) => count !== 0),
      canRemoveBeacon: replica.value.includes("beacon"),
    };
  });
  const [left, right] = ordered;
  let comparison: PresentedFrame["comparison"] = null;
  if (left && right) {
    const relation = compareVectors(left.clock, right.clock);
    comparison = {
      relation,
      label: relation === "equal" || relation === "concurrent"
        ? `${left.id} and ${right.id} are ${relation}`
        : `${left.id} is ${relation} ${right.id}`,
      evidence: `${left.id} [${vectorLabel(left.clock)}]; ${right.id} [${vectorLabel(right.clock)}]`,
    };
  }
  const added = ordered.find((replica) =>
    replica.value.some((value) => frame.actionLabel === `add ${value} at ${replica.id}`),
  );
  const announcement = [
    added ? `${added.id} created dot ${added.id}:${added.clock[added.id]}.` : "",
    frame.explanation,
    comparison ? `${comparison.label}.` : "",
  ].filter(Boolean).join(" ");
  const invariantLabels: Record<string, string> = {
    uniqueDots: "Unique dots",
    removedDotsStayRemoved: "Removed dots stay removed",
    converged: "Converged",
  };
  return {
    index: frame.index,
    actionLabel: frame.actionLabel,
    explanation: frame.explanation,
    announcement,
    replicas,
    messages: frame.messages.map((message) => {
      const dots = dotLabels(message.dots);
      const dotsLabel = dots.join(", ") || "No live dots";
      const contextLabel = vectorLabel(message.context);
      const [number, , , ...copies] = message.id.split(":");
      return {
        id: message.id,
        from: message.from,
        to: message.to,
        routeLabel: `${[number, ...copies].join(" ")} from ${message.from} to ${message.to}`,
        payloadLabel: `${message.kind}; live dots: ${dotsLabel}; causal context: ${contextLabel}`,
        kindLabel: message.kind,
        dotLabels: dots,
        dotsLabel,
        contextLabel,
        blocked: blocked(message.from, message.to),
      };
    }),
    comparison,
    links: ordered.flatMap((replica, index) => ordered.slice(index + 1).map((peer) => ({
      left: replica.id, right: peer.id, partitioned: blocked(replica.id, peer.id),
    }))),
    invariants: Object.entries(frame.invariants).map(([id, passed]) => ({
      id, label: invariantLabels[id] ?? id, passed,
    })),
  };
}
