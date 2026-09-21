export type RemainingFamily = "sequences" | "coordination" | "transforms";
export type RemainingStructureId =
  | "shared-sequence"
  | "shared-text"
  | "claims"
  | "ordered-collection"
  | "task-manager"
  | "pact-map"
  | "json-ot"
  | "shared-rich-text";

export type RemainingStructure = {
  id: RemainingStructureId;
  glossaryId: string;
  family: RemainingFamily;
  name: string;
  module: string;
  tagline: string;
  rule: string;
  story: string;
  raceLabel: string;
  initial: string[];
  local: Record<"A" | "B" | "C", string>;
  final: string[];
  result: string;
  next?: RemainingStructureId;
};

export const remainingStructures: RemainingStructure[] = [
  {
    id: "shared-sequence",
    glossaryId: "sharedsequence",
    family: "sequences",
    name: "SharedSequence",
    module: "sequence_kernel",
    tagline: "Reorder one route without making concurrent index edits fight.",
    rule: "Stable item identities carry inserts and moves beneath changing indexes.",
    story: "Alice and Bob revise the ranger's ordered inspection route before either receives the other edit.",
    raceLabel: "Race the route insertions",
    initial: ["Bridge", "Weir", "North gate"],
    local: { A: "Insert Falls before Weir", B: "Insert Marsh before Weir", C: "Observe the route" },
    final: ["Bridge", "Falls", "Marsh", "Weir", "North gate"],
    result: "Both waypoints survive at one logical gap, in deterministic identity order.",
    next: "shared-text",
  },
  {
    id: "shared-text",
    glossaryId: "sharedtext",
    family: "sequences",
    name: "SharedText",
    module: "text_kernel",
    tagline: "Merge concurrent typing by grapheme identity, not fragile offsets.",
    rule: "Every grapheme keeps a stable identity and concurrent insertions both survive.",
    story: "Alice and Bob add weather adjectives to the same Eagle Creek field note.",
    raceLabel: "Race the field-note edits",
    initial: ["The weir is clear."],
    local: { A: "Insert still", B: "Insert calm", C: "Observe the note" },
    final: ["The still calm weir is clear."],
    result: "Both insertions remain, and no edit splits a grapheme.",
  },
  {
    id: "claims",
    glossaryId: "claims",
    family: "coordination",
    name: "Claims",
    module: "claims_kernel",
    tagline: "Choose one permanent claimant for a named responsibility.",
    rule: "The first sequenced claim wins; committed claims are write-once.",
    story: "Alice, Bob, and Carol all volunteer to hold the only gate key.",
    raceLabel: "Race the gate-key claims",
    initial: ["gate-key: unclaimed"],
    local: { A: "Claim gate-key", B: "Claim gate-key", C: "Claim gate-key" },
    final: ["gate-key: Alice"],
    result: "Alice's claim sequences first. Every station reads the same owner.",
    next: "ordered-collection",
  },
  {
    id: "ordered-collection",
    glossaryId: "orderedcollection",
    family: "coordination",
    name: "OrderedCollection",
    module: "ordered_collection_kernel",
    tagline: "Give one queued job to one worker without duplicate ownership.",
    rule: "The sequencer grants each queued item to the first accepted acquire.",
    story: "One bridge inspection waits in the ranger queue while three hikers ask for it.",
    raceLabel: "Race to acquire the inspection",
    initial: ["Queue: inspect bridge"],
    local: { A: "Acquire next job", B: "Acquire next job", C: "Acquire next job" },
    final: ["Alice owns inspect bridge", "Queue empty"],
    result: "One acquire wins. Bob and Carol cannot receive the same job.",
    next: "task-manager",
  },
  {
    id: "task-manager",
    glossaryId: "taskmanager",
    family: "coordination",
    name: "TaskManager",
    module: "task_manager_kernel",
    tagline: "Queue volunteers for one role and promote the next connected client.",
    rule: "A FIFO volunteer queue assigns one client and preserves failover order.",
    story: "The ranger needs one dispatcher and a known replacement if that hiker disconnects.",
    raceLabel: "Queue the dispatcher volunteers",
    initial: ["dispatcher: unassigned"],
    local: { A: "Volunteer", B: "Volunteer", C: "Volunteer" },
    final: ["dispatcher: Alice", "waiting: Bob, Carol"],
    result: "Alice is assigned. Bob is first in the failover queue.",
    next: "pact-map",
  },
  {
    id: "pact-map",
    glossaryId: "pactmap",
    family: "coordination",
    name: "PactMap",
    module: "pact_map_kernel",
    tagline: "Accept a shared setting only after the connected roster signs off.",
    rule: "A proposal remains pending until every expected client accepts it.",
    story: "Alice proposes a trail closure target that must reach every staffed station.",
    raceLabel: "Propose and sign off the closure",
    initial: ["closure-target: absent"],
    local: { A: "Propose ridge-pass", B: "Sign off", C: "Sign off" },
    final: ["closure-target: ridge-pass", "accepted by A, B, C"],
    result: "The value becomes readable only after the full roster signs off.",
  },
  {
    id: "json-ot",
    glossaryId: "jsonot",
    family: "transforms",
    name: "JsonOt",
    module: "json_ot_kernel",
    tagline: "Transform concurrent edits to different paths in one JSON document.",
    rule: "Each operation transforms through concurrent operations before application.",
    story: "Alice adds the report title while Bob adds its revision number.",
    raceLabel: "Race the JSON field edits",
    initial: ["{}"],
    local: { A: "Set title", B: "Set revision", C: "Observe the document" },
    final: ['{"title":"field notes","revision":1}'],
    result: "Both disjoint path edits survive transformation.",
    next: "shared-rich-text",
  },
  {
    id: "shared-rich-text",
    glossaryId: "sharedrichtext",
    family: "transforms",
    name: "SharedRichText",
    module: "rich_text_kernel",
    tagline: "Transform formatting and text edits against one shared document.",
    rule: "Retain, insert, and delete deltas transform while preserving attributes.",
    story: "Alice bolds the report heading while Bob appends the current trail symbol.",
    raceLabel: "Race formatting and insertion",
    initial: ["Hello World"],
    local: { A: "Bold Hello", B: "Append marker", C: "Observe the report" },
    final: ["Hello [bold] World ▲"],
    result: "The heading keeps its formatting and Bob's insertion remains.",
  },
];

export const remainingFamilies: Record<RemainingFamily, {
  name: string;
  tagline: string;
  intro: string;
}> = {
  sequences: {
    name: "Sequences",
    tagline: "Keep order stable while many clients insert, move, and type.",
    intro: "The Eagle Creek record now has an order. Alice and Bob edit the same route and note while Carol watches delayed operations arrive.",
  },
  coordination: {
    name: "Coordination",
    tagline: "Choose one owner, one worker, or one accepted value.",
    intro: "Some ranger decisions must not merge into several answers. These structures use the sequencer and connected roster to coordinate one outcome.",
  },
  transforms: {
    name: "Transforms",
    tagline: "Rewrite concurrent operations so both can apply.",
    intro: "The field report becomes a collaborative document. Operations transform against concurrent work instead of choosing one winner.",
  },
};

export function structuresForFamily(family: RemainingFamily): RemainingStructure[] {
  return remainingStructures.filter((structure) => structure.family === family);
}

export function structureById(id: string): RemainingStructure | undefined {
  return remainingStructures.find((structure) => structure.id === id);
}
