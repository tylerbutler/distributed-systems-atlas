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
  localVisibility?: string;
  raceLabel: string;
  recordLabel: string;
  messageLabel: string;
  sources: Array<{ name: string; path: string }>;
  operations: string[];
  initial: string[];
  initialRecord: Record<"A" | "B" | "C", string>;
  local: Record<"A" | "B" | "C", string>;
  evidence: Record<"A" | "B" | "C", string>;
  result: string;
};

export const sequenceStopMarks = { Falls: "A:4", Marsh: "B:4" } as const;

export const remainingStructures: RemainingStructure[] = [
  {
    id: "shared-sequence",
    glossaryId: "sharedsequence",
    family: "sequences",
    kind: "CRDT",
    name: "SharedSequence",
    module: "sequence_kernel",
    tagline: "Alice and Bob add trail stops to the same route without losing either one.",
    rule: "Give each trail stop its own mark, so adding or moving other trail stops does not change which one a note means.",
    story: "Alice and Bob revise the ranger's inspection route, an ordered list of trail stops, before either receives the other's edit.",
    raceLabel: "Race the route insertions",
    recordLabel: "Trail stop list",
    messageLabel: "Insertion slip",
    sources: [{ name: "sequence_kernel", path: "sequence_kernel.gleam" }],
    operations: [
      "sequence_kernel.p2p_insert",
      "sequence_kernel.apply_remote",
      "sequence_kernel.values",
    ],
    initial: ["Bridge", "Weir", "North gate"],
    initialRecord: {
      A: "Bridge · Weir · North gate",
      B: "Bridge · Weir · North gate",
      C: "Bridge · Weir · North gate",
    },
    local: { A: "Insert Falls before Weir", B: "Insert Marsh before Weir", C: "Observe the route" },
    evidence: {
      A: "Trail stop ID",
      B: "Trail stop ID",
      C: "No slip in this race",
    },
    result: "Both new trail stops target the gap before Weir. Falls has ID A:4, and Marsh has ID B:4. Every notebook compares those IDs the same way, placing Falls before Marsh.",
  },
  {
    id: "shared-text",
    glossaryId: "sharedtext",
    family: "sequences",
    kind: "CRDT",
    name: "SharedText",
    module: "text_kernel",
    tagline: "Alice, Bob, and Carol can type in one field note without losing concurrent edits.",
    rule: "Treat each grapheme as a SharedSequence item with its own identity, so replicas merge deltas instead of replaying stale character offsets.",
    story: "Alice and Bob revise the same sentence while Carol reads an older copy of the field note.",
    raceLabel: "Crowd an insert before “weir”",
    recordLabel: "Field-note page",
    messageLabel: "Text-edit slip",
    sources: [{ name: "text_kernel", path: "text_kernel.gleam" }],
    operations: [
      "text_kernel.insert",
      "text_kernel.delete_range",
      "text_kernel.replace_range",
      "text_kernel.ack_local",
      "text_kernel.apply_remote",
      "text_kernel.value",
    ],
    initial: ["The weir is clear."],
    initialRecord: {
      A: "The weir is clear.",
      B: "The weir is clear.",
      C: "The weir is clear.",
    },
    local: { A: "Insert still", B: "Insert calm", C: "Observe the note" },
    evidence: {
      A: "still mark A:1 · before weir",
      B: "calm mark B:1 · before weir",
      C: "No slip in this race",
    },
    result: "Alice and Bob target the same place before “weir.” Both words remain after delivery because SharedText identifies the nearby symbols instead of relying on one changing character offset.",
  },
  {
    id: "claims",
    glossaryId: "claims",
    family: "coordination",
    kind: "DDS",
    name: "Claims",
    module: "claims_kernel",
    tagline: "Choose one permanent claimant for a named responsibility.",
    rule: "The ranger numbers the claim slips. He assigns the first accepted claimant and does not replace them.",
    story: "Alice, Bob, and Carol all volunteer to hold the only gate key.",
    localVisibility: "Alice can send her claim at once, but her ledger still shows that nobody holds the gate key. The ranger numbers the claims; only then does the winner appear in anyone's ledger.",
    raceLabel: "Race the gate-key claims",
    recordLabel: "Claim ledger",
    messageLabel: "Claim slip",
    sources: [{ name: "claims_kernel", path: "claims_kernel.gleam" }],
    operations: [
      "claims_kernel.claim_once",
      "claims_kernel.ack_local",
      "claims_kernel.apply_remote",
      "claims_kernel.get",
    ],
    initial: ["gate-key: unclaimed"],
    initialRecord: {
      A: "gate-key: unclaimed",
      B: "gate-key: unclaimed",
      C: "gate-key: unclaimed",
    },
    local: { A: "Claim gate-key", B: "Claim gate-key", C: "Claim gate-key" },
    evidence: {
      A: "Alice's claim · awaits a number",
      B: "Bob's claim · awaits a number",
      C: "Carol's claim · awaits a number",
    },
    result: "The ranger numbers Alice's claim first. Every station records Alice as the owner.",
  },
  {
    id: "ordered-collection",
    glossaryId: "orderedcollection",
    family: "coordination",
    kind: "DDS",
    name: "OrderedCollection",
    module: "ordered_collection_kernel",
    tagline: "Give one bridge inspection to one hiker.",
    rule: "The ranger numbers the request slips and gives each queued job to the first accepted requester.",
    story: "The ranger queue contains one bridge inspection while three hikers request it.",
    localVisibility: "Alice, Bob, and Carol can ask for the job before the ranger numbers their slips. None can mark the inspection as theirs until a numbered request takes it from the queue. The same rule applies when someone adds, completes, or releases a job.",
    raceLabel: "Race to acquire the inspection",
    recordLabel: "Work queue card",
    messageLabel: "Request slip",
    sources: [{
      name: "ordered_collection_kernel",
      path: "ordered_collection_kernel.gleam",
    }],
    operations: [
      "ordered_collection_kernel.acquire",
      "ordered_collection_kernel.ack_local",
      "ordered_collection_kernel.apply_remote",
      "ordered_collection_kernel.summary_jobs",
    ],
    initial: ["Queue: inspect bridge"],
    initialRecord: {
      A: "Queue: inspect bridge",
      B: "Queue: inspect bridge",
      C: "Queue: inspect bridge",
    },
    local: { A: "Acquire next job", B: "Acquire next job", C: "Acquire next job" },
    evidence: {
      A: "Alice's request · awaits a number",
      B: "Bob's request · awaits a number",
      C: "Carol's request · awaits a number",
    },
    result: "The ranger accepts Alice's request. Bob and Carol do not get the same job.",
  },
  {
    id: "task-manager",
    glossaryId: "taskmanager",
    family: "coordination",
    kind: "DDS",
    name: "TaskManager",
    module: "task_manager_kernel",
    tagline: "Keep a duty roster with one dispatcher and the next volunteer in line.",
    rule: "The ranger lists volunteers in the order they sign up. If the dispatcher leaves, the next connected hiker takes over.",
    story: "The ranger needs one dispatcher and a known replacement if that hiker disconnects.",
    localVisibility: "Alice keeps a copy of her volunteer slip so she does not send it twice. She cannot mark herself assigned or even confirmed in the queue until the ranger numbers her request.",
    raceLabel: "Queue the dispatcher volunteers",
    recordLabel: "Duty roster",
    messageLabel: "Volunteer slip",
    sources: [{ name: "task_manager_kernel", path: "task_manager_kernel.gleam" }],
    operations: [
      "task_manager_kernel.volunteer",
      "task_manager_kernel.ack_local",
      "task_manager_kernel.apply_remote",
      "task_manager_kernel.summary_queues",
    ],
    initial: ["dispatcher: unassigned"],
    initialRecord: {
      A: "dispatcher: unassigned",
      B: "dispatcher: unassigned",
      C: "dispatcher: unassigned",
    },
    local: { A: "Volunteer", B: "Volunteer", C: "Volunteer" },
    evidence: {
      A: "volunteer Alice · place in line pending",
      B: "volunteer Bob · place in line pending",
      C: "volunteer Carol · place in line pending",
    },
    result: "Alice is the dispatcher. Bob is next in line if she leaves.",
  },
  {
    id: "pact-map",
    glossaryId: "pactmap",
    family: "coordination",
    kind: "DDS",
    name: "PactMap",
    module: "pact_map_kernel",
    tagline: "Change the closure plan only after every staffed station agrees.",
    rule: "The ranger waits for every station on the roster to sign the proposal before anyone uses the new answer.",
    story: "Alice proposes a trail closure target that must be delivered to every staffed station.",
    localVisibility: "Alice can send a proposal, but her notebook still shows the old plan. After the ranger numbers her slip, each station can see that the proposal awaits signatures. Only after the required stations sign off can anyone read the new value.",
    raceLabel: "Propose and sign off the closure",
    recordLabel: "Closure agreement",
    messageLabel: "Agreement slip",
    sources: [{ name: "pact_map_kernel", path: "pact_map_kernel.gleam" }],
    operations: [
      "pact_map_kernel.set",
      "pact_map_kernel.apply_set",
      "pact_map_kernel.apply_accept",
      "pact_map_kernel.get",
    ],
    initial: ["closure-target: absent"],
    initialRecord: {
      A: "closure-target: absent",
      B: "closure-target: absent",
      C: "closure-target: absent",
    },
    local: { A: "Propose ridge-pass", B: "Sign off", C: "Sign off" },
    evidence: {
      A: "ridge-pass proposal · needs A, B, C",
      B: "Bob signs off",
      C: "Carol signs off",
    },
    result: "Each station keeps the old closure plan until everyone on the roster signs off.",
  },
  {
    id: "json-ot",
    glossaryId: "jsonot",
    family: "transforms",
    kind: "OT",
    name: "JsonOt",
    module: "json_ot_kernel",
    tagline: "Keep Alice's title and Bob's revision number in one shared report.",
    rule: "Adjust each edit against the other edits made at the same time before adding it to the shared report.",
    story: "Alice adds a title to the report while Bob adds its revision number.",
    localVisibility: "Alice sees her title edit before the ranger gives it a number; Bob sees his revision edit too. They keep later edits aside while the ranger's numbered notes arrive. Each hiker adjusts their own notes against the other's before accepting the ranger's reply.",
    raceLabel: "Race the report edits",
    recordLabel: "Report worksheet",
    messageLabel: "Edit slip",
    sources: [
      { name: "json_ot_kernel", path: "json_ot_kernel.gleam" },
      { name: "json_ot", path: "json_ot.gleam" },
    ],
    operations: [
      "json_ot.object_insert",
      "json_ot_kernel.submit",
      "json_ot_kernel.ack_local",
      "json_ot_kernel.apply_remote",
      "json_ot_kernel.view",
    ],
    initial: ["{}"],
    initialRecord: { A: "{}", B: "{}", C: "{}" },
    local: { A: "Set title", B: "Set revision", C: "Observe the document" },
    evidence: {
      A: 'path /title · value "field notes"',
      B: "path /revision · value 1",
      C: "No slip in this race",
    },
    result: "The shared report has Alice's title and Bob's revision number.",
  },
  {
    id: "shared-rich-text",
    glossaryId: "sharedrichtext",
    family: "transforms",
    kind: "OT",
    name: "SharedRichText",
    module: "rich_text_kernel",
    tagline: "Keep Alice's bold heading and Bob's new symbol in the same report.",
    rule: "Adjust each edit against the other hiker's work so the heading stays bold and the new symbol stays in place.",
    story: "Alice bolds the report heading while Bob appends the current trail symbol.",
    localVisibility: "Alice sees the bold heading as soon as she edits it; Bob sees his own addition too. They keep later edits aside and adjust each new note against work already in the report. The ranger's numbered reply confirms each edit.",
    raceLabel: "Race formatting and insertion",
    recordLabel: "Report page",
    messageLabel: "Edit slip",
    sources: [
      { name: "rich_text_kernel", path: "rich_text_kernel.gleam" },
      { name: "rich_text", path: "rich_text.gleam" },
    ],
    operations: [
      "rich_text.delta_retain",
      "rich_text.delta_insert_text",
      "rich_text_kernel.submit",
      "rich_text_kernel.ack_local",
      "rich_text_kernel.apply_remote",
      "rich_text_kernel.view",
    ],
    initial: ["Hello World"],
    initialRecord: { A: "Hello World", B: "Hello World", C: "Hello World" },
    local: { A: "Bold Hello", B: "Append marker", C: "Observe the report" },
    evidence: {
      A: "bold the first 5 characters",
      B: "add ▲ after the first 11 characters",
      C: "No slip in this race",
    },
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
    tagline: "Keep everyone's trail stops and written notes in order.",
    intro: "Alice and Bob each have a copy of the ranger's trail stop list and field notes. Before they compare changes, both add a trail stop at the same place on the list. How can they keep both trail stops in order?",
  },
  coordination: {
    name: "Coordination",
    tagline: "Choose one owner, one worker, or one accepted value.",
    intro: "The ranger cannot give the same gate key or bridge inspection to two hikers. He numbers their requests and keeps a roster, so every station records the same decision.",
  },
  transforms: {
    name: "Transforms",
    tagline: "Adjust simultaneous edits so both can go into one report.",
    intro: "Alice and Bob edit separate parts of the ranger's report before they see each other's work. Each hiker adjusts their own edit when the other's note arrives, so the shared report includes both.",
  },
};

export function structuresForFamily(family: RemainingFamily): RemainingStructure[] {
  return remainingStructures.filter((structure) => structure.family === family);
}

export function structureById(id: string): RemainingStructure | undefined {
  return remainingStructures.find((structure) => structure.id === id);
}
