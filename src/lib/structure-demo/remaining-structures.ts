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
  kind: "CRDT" | "DDS" | "OT";
  name: string;
  module: string;
  tagline: string;
  rule: string;
  story: string;
  raceLabel: string;
  recordLabel: string;
  messageLabel: string;
  initial: string[];
  initialRecord: Record<"A" | "B" | "C", string>;
  local: Record<"A" | "B" | "C", string>;
  evidence: Record<"A" | "B" | "C", string>;
  final: string[];
  result: string;
  next?: RemainingStructureId;
};

export const remainingStructures: RemainingStructure[] = [
  {
    id: "shared-sequence",
    glossaryId: "sharedsequence",
    family: "sequences",
    kind: "CRDT",
    name: "SharedSequence",
    module: "sequence_kernel",
    tagline: "Reorder one route without making concurrent index edits fight.",
    rule: "Clients refer to stable item identities when they insert or move items at changing indexes.",
    story: "Alice and Bob revise the ranger's ordered inspection route before either receives the other edit.",
    raceLabel: "Race the route insertions",
    recordLabel: "Route card",
    messageLabel: "Insertion slip",
    initial: ["Bridge", "Weir", "North gate"],
    initialRecord: {
      A: "Bridge · Weir · North gate",
      B: "Bridge · Weir · North gate",
      C: "Bridge · Weir · North gate",
    },
    local: { A: "Insert Falls before Weir", B: "Insert Marsh before Weir", C: "Observe the route" },
    evidence: {
      A: "Falls identity A:1 · anchor Weir",
      B: "Marsh identity B:1 · anchor Weir",
      C: "No slip in this race",
    },
    final: ["Bridge", "Falls", "Marsh", "Weir", "North gate"],
    result: "Both waypoints survive at one logical gap, in deterministic identity order.",
    next: "shared-text",
  },
  {
    id: "shared-text",
    glossaryId: "sharedtext",
    family: "sequences",
    kind: "CRDT",
    name: "SharedText",
    module: "text_kernel",
    tagline: "Merge concurrent typing by grapheme identity, not fragile offsets.",
    rule: "Every grapheme keeps a stable identity and concurrent insertions both survive.",
    story: "Alice and Bob add weather adjectives to the same Eagle Creek field note.",
    raceLabel: "Race the field-note edits",
    recordLabel: "Field-note page",
    messageLabel: "Text-edit slip",
    initial: ["The weir is clear."],
    initialRecord: {
      A: "The weir is clear.",
      B: "The weir is clear.",
      C: "The weir is clear.",
    },
    local: { A: "Insert still", B: "Insert calm", C: "Observe the note" },
    evidence: {
      A: "grapheme identity A:1 · before weir",
      B: "grapheme identity B:1 · before weir",
      C: "No slip in this race",
    },
    final: ["The still calm weir is clear."],
    result: "Both insertions remain, and no edit splits a grapheme.",
  },
  {
    id: "claims",
    glossaryId: "claims",
    family: "coordination",
    kind: "DDS",
    name: "Claims",
    module: "claims_kernel",
    tagline: "Choose one permanent claimant for a named responsibility.",
    rule: "Accept the first sequenced claim; committed claims are write-once.",
    story: "Alice, Bob, and Carol all volunteer to hold the only gate key.",
    raceLabel: "Race the gate-key claims",
    recordLabel: "Claim ledger",
    messageLabel: "Claim slip",
    initial: ["gate-key: unclaimed"],
    initialRecord: {
      A: "gate-key: unclaimed",
      B: "gate-key: unclaimed",
      C: "gate-key: unclaimed",
    },
    local: { A: "Claim gate-key", B: "Claim gate-key", C: "Claim gate-key" },
    evidence: {
      A: "claimant Alice · awaits sequence",
      B: "claimant Bob · awaits sequence",
      C: "claimant Carol · awaits sequence",
    },
    final: ["gate-key: Alice"],
    result: "Alice's claim sequences first. Every station reads the same owner.",
    next: "ordered-collection",
  },
  {
    id: "ordered-collection",
    glossaryId: "orderedcollection",
    family: "coordination",
    kind: "DDS",
    name: "OrderedCollection",
    module: "ordered_collection_kernel",
    tagline: "Give one queued job to one worker without duplicate ownership.",
    rule: "The sequencer grants each queued item to the first accepted acquire.",
    story: "The ranger queue contains one bridge inspection while three hikers request it.",
    raceLabel: "Race to acquire the inspection",
    recordLabel: "Work queue card",
    messageLabel: "Acquire slip",
    initial: ["Queue: inspect bridge"],
    initialRecord: {
      A: "Queue: inspect bridge",
      B: "Queue: inspect bridge",
      C: "Queue: inspect bridge",
    },
    local: { A: "Acquire next job", B: "Acquire next job", C: "Acquire next job" },
    evidence: {
      A: "requester Alice · awaits sequence",
      B: "requester Bob · awaits sequence",
      C: "requester Carol · awaits sequence",
    },
    final: ["Alice owns inspect bridge", "Queue empty"],
    result: "Accept one acquire. Bob and Carol cannot receive the same job.",
    next: "task-manager",
  },
  {
    id: "task-manager",
    glossaryId: "taskmanager",
    family: "coordination",
    kind: "DDS",
    name: "TaskManager",
    module: "task_manager_kernel",
    tagline: "Queue volunteers for one role and promote the next connected client.",
    rule: "A FIFO volunteer queue assigns one client and preserves failover order.",
    story: "The ranger needs one dispatcher and a known replacement if that hiker disconnects.",
    raceLabel: "Queue the dispatcher volunteers",
    recordLabel: "Duty roster",
    messageLabel: "Volunteer slip",
    initial: ["dispatcher: unassigned"],
    initialRecord: {
      A: "dispatcher: unassigned",
      B: "dispatcher: unassigned",
      C: "dispatcher: unassigned",
    },
    local: { A: "Volunteer", B: "Volunteer", C: "Volunteer" },
    evidence: {
      A: "volunteer Alice · FIFO position pending",
      B: "volunteer Bob · FIFO position pending",
      C: "volunteer Carol · FIFO position pending",
    },
    final: ["dispatcher: Alice", "waiting: Bob, Carol"],
    result: "Alice is assigned. Bob is first in the failover queue.",
    next: "pact-map",
  },
  {
    id: "pact-map",
    glossaryId: "pactmap",
    family: "coordination",
    kind: "DDS",
    name: "PactMap",
    module: "pact_map_kernel",
    tagline: "Accept a shared setting only after the connected roster signs off.",
    rule: "A proposal remains pending until every expected client accepts it.",
    story: "Alice proposes a trail closure target that must be delivered to every staffed station.",
    raceLabel: "Propose and sign off the closure",
    recordLabel: "Closure agreement",
    messageLabel: "Agreement slip",
    initial: ["closure-target: absent"],
    initialRecord: {
      A: "closure-target: absent",
      B: "closure-target: absent",
      C: "closure-target: absent",
    },
    local: { A: "Propose ridge-pass", B: "Sign off", C: "Sign off" },
    evidence: {
      A: "proposal ridge-pass · expected A, B, C",
      B: "acceptance by B",
      C: "acceptance by C",
    },
    final: ["closure-target: ridge-pass", "accepted by A, B, C"],
    result: "The value becomes readable only after the full roster signs off.",
  },
  {
    id: "json-ot",
    glossaryId: "jsonot",
    family: "transforms",
    kind: "OT",
    name: "JsonOt",
    module: "json_ot_kernel",
    tagline: "Transform concurrent edits to different paths in one JSON document.",
    rule: "Each operation transforms through concurrent operations before application.",
    story: "Alice adds the report title while Bob adds its revision number.",
    raceLabel: "Race the JSON field edits",
    recordLabel: "JSON worksheet",
    messageLabel: "Patch slip",
    initial: ["{}"],
    initialRecord: { A: "{}", B: "{}", C: "{}" },
    local: { A: "Set title", B: "Set revision", C: "Observe the document" },
    evidence: {
      A: 'path /title · value "field notes"',
      B: "path /revision · value 1",
      C: "No slip in this race",
    },
    final: ['{"title":"field notes","revision":1}'],
    result: "Both disjoint path edits survive transformation.",
    next: "shared-rich-text",
  },
  {
    id: "shared-rich-text",
    glossaryId: "sharedrichtext",
    family: "transforms",
    kind: "OT",
    name: "SharedRichText",
    module: "rich_text_kernel",
    tagline: "Transform formatting and text edits against one shared document.",
    rule: "Retain, insert, and delete deltas transform while preserving attributes.",
    story: "Alice bolds the report heading while Bob appends the current trail symbol.",
    raceLabel: "Race formatting and insertion",
    recordLabel: "Report page",
    messageLabel: "Rich-text edit slip",
    initial: ["Hello World"],
    initialRecord: { A: "Hello World", B: "Hello World", C: "Hello World" },
    local: { A: "Bold Hello", B: "Append marker", C: "Observe the report" },
    evidence: {
      A: "retain 5 · bold true",
      B: "retain 11 · insert ▲",
      C: "No slip in this race",
    },
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
    intro: "The Eagle Creek record now has an order. Alice and Bob edit the same route and note while Carol observes the delivery of delayed operations.",
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
