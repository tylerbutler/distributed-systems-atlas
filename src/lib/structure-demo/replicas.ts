export const REPLICA_IDS = ["A", "B", "C"] as const;

export type DemoReplicaId = (typeof REPLICA_IDS)[number];

export function isDemoReplicaId(value: string): value is DemoReplicaId {
  return REPLICA_IDS.some((id) => id === value);
}

export function demoReplicaName(id: DemoReplicaId): string {
  return { A: "Alice", B: "Bob", C: "Carol" }[id];
}
