export type RemainingFamily = "maps" | "sequences" | "coordination";
export type RemainingStructureId =
  | "sequence-crdt"
  | "text-crdt"
  | "claims"
  | "fifo-work-queue"
  | "task-manager"
  | "pact-map"
  | "json-ot"
  | "rich-text-ot";

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
    id: "sequence-crdt",
    glossaryId: "sequencecrdt",
    family: "sequences",
    kind: "CRDT",
    name: "SequenceCrdt",
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
    id: "text-crdt",
    glossaryId: "textcrdt",
    family: "sequences",
    kind: "CRDT",
    name: "TextCrdt",
    module: "text_kernel",
    tagline: "Alice, Bob, and Carol can type in one field note without losing concurrent edits.",
    rule: "Treat each grapheme as a SequenceCrdt item with its own identity, so replicas merge deltas instead of replaying stale character offsets.",
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
    result: "Alice and Bob target the same place before “weir.” Both words remain after delivery because TextCrdt identifies the nearby symbols instead of relying on one changing character offset.",
  },
  {
    id: "claims",
    glossaryId: "claims",
    family: "coordination",
    kind: "DDS",
    name: "Claims",
    module: "claims_kernel",
    tagline: "Choose one permanent claimant for a named responsibility.",
    rule: "The sequencer numbers claim requests. The first accepted claim fills that key permanently; later claims cannot replace or remove it.",
    story: "Alice, Bob, and Carol all volunteer to hold the only gate key.",
    raceLabel: "Race the gate-key claims",
    recordLabel: "Claims state",
    messageLabel: "Pending request",
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
    result: "The sequencer accepts Alice's claim first. Every replica records Alice as the permanent owner. Later claims for gate-key are rejected; the application must use a new key or create a new Claims state to start again.",
  },
  {
    id: "fifo-work-queue",
    glossaryId: "fifoworkqueue",
    family: "coordination",
    kind: "DDS",
    name: "FifoWorkQueue",
    module: "ordered_collection_kernel",
    tagline: "Dispatch trail jobs in the order they entered the queue.",
    rule: "A claim takes the oldest queued job. A release returns held work to the queue tail.",
    story: "The ranger lists three jobs in arrival order: inspect the bridge, clear a fallen branch, and restock the first-aid cache. Alice, Bob, and Carol take work from the same dispatch queue.",
    localVisibility: "A claim, completion, or release does not change the shared board until the sequencer accepts it. The queue can therefore give one active holder a job without making a client-side request look final too early.",
    raceLabel: "Run release-to-tail example",
    recordLabel: "Work queue card",
    messageLabel: "Request slip",
    sources: [{
      name: "ordered_collection_kernel",
      path: "ordered_collection_kernel.gleam",
    }],
    operations: [
      "ordered_collection_kernel.add",
      "ordered_collection_kernel.acquire",
      "ordered_collection_kernel.complete",
      "ordered_collection_kernel.release",
      "ordered_collection_kernel.ack_local",
      "ordered_collection_kernel.apply_remote",
      "ordered_collection_kernel.summary_jobs",
    ],
    initial: ["Queue: inspect bridge", "Queue: clear fallen branch", "Queue: restock first-aid cache"],
    initialRecord: {
      A: "3 jobs queued",
      B: "3 jobs queued",
      C: "3 jobs queued",
    },
    local: { A: "Acquire next job", B: "Acquire next job", C: "Acquire next job" },
    evidence: {
      A: "Alice's request · awaits a number",
      B: "Bob's request · awaits a number",
      C: "Carol's request · awaits a number",
    },
    result: "Alice gets the oldest job, and Bob gets the next one. When Alice releases the bridge inspection, it returns behind the first-aid job. Carol therefore gets the first-aid job next. Bob's completed branch job leaves the queue; the demo records it in a separate session history.",
  },
  {
    id: "task-manager",
    glossaryId: "taskmanager",
    family: "coordination",
    kind: "DDS",
    name: "TaskManager",
    module: "task_manager_kernel",
    tagline: "Assign one active worker and keep ordered replacements ready.",
    rule: "The first connected volunteer owns the task. Leaving or disconnecting promotes the next volunteer.",
    story: "The ranger needs one person at the dispatch desk throughout the storm. Alice, Bob, and Carol volunteer in order so the next connected hiker can take over without another election.",
    localVisibility: "A client tracks its own pending volunteer or leave request so it does not send the same intent twice. Assignment and waiting positions remain unconfirmed until the sequencer numbers the operation.",
    raceLabel: "Run promotion example",
    recordLabel: "Duty roster",
    messageLabel: "Volunteer slip",
    sources: [{ name: "task_manager_kernel", path: "task_manager_kernel.gleam" }],
    operations: [
      "task_manager_kernel.volunteer",
      "task_manager_kernel.abandon",
      "task_manager_kernel.complete",
      "task_manager_kernel.remove_client",
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
    result: "Alice is assigned first, with Bob and Carol waiting in order. When Alice disconnects, Bob is promoted without a new election. When Bob completes the task, TaskManager clears the whole dispatcher roster instead of promoting Carol.",
  },
  {
    id: "pact-map",
    glossaryId: "pactmap",
    family: "coordination",
    kind: "DDS",
    name: "PactMap",
    module: "pact_map_kernel",
    tagline: "Keep the accepted plan readable until a frozen roster clears its replacement.",
    rule: "A sequenced proposal freezes the connected roster. The replacement becomes readable after every required signer accepts or leaves.",
    story: "The current closure directs hikers to north-gate. Alice proposes ridge-pass instead, but the ranger must keep north-gate in force until every station that was connected when the proposal arrived has cleared the change.",
    localVisibility: "A proposal does not replace the accepted value. After the sequencer freezes the required roster, each station can queue one signoff. The accepted value changes only when no required signers remain.",
    raceLabel: "Run roster-change example",
    recordLabel: "Closure agreement",
    messageLabel: "Agreement slip",
    sources: [{ name: "pact_map_kernel", path: "pact_map_kernel.gleam" }],
    operations: [
      "pact_map_kernel.set",
      "pact_map_kernel.apply_set",
      "pact_map_kernel.apply_accept",
      "pact_map_kernel.remove_member",
      "pact_map_kernel.pending",
      "pact_map_kernel.get",
    ],
    initial: ["accepted: north-gate"],
    initialRecord: {
      A: "accepted: north-gate",
      B: "accepted: north-gate",
      C: "accepted: north-gate",
    },
    local: { A: "Propose ridge-pass", B: "Sign off", C: "Sign off" },
    evidence: {
      A: "ridge-pass proposal · needs A, B, C",
      B: "Bob signs off",
      C: "Carol signs off",
    },
    result: "North-gate remains readable while ridge-pass is pending. Alice and Bob sign off. When Carol leaves the frozen roster, no required signers remain, so ridge-pass becomes the accepted closure target.",
  },
  {
    id: "json-ot",
    glossaryId: "jsonot",
    family: "maps",
    kind: "OT",
    name: "JsonOt",
    module: "json_ot_kernel",
    tagline: "Keep concurrent changes to nested JSON paths and array positions.",
    rule: "Transform each operation past concurrent sequenced operations before applying it to the current document.",
    story: "The ranger's incident report has a site name, a nested gauge reading, and an ordered crew list. Alice and Bob both add a crew member at the front while Carol raises the gauge stage.",
    localVisibility: "Alice immediately sees Cy at crew position 0, Bob sees Dot at the same position, and Carol sees the higher gauge stage. Each edit stays pending until the sequencer numbers it. Incoming operations are transformed against the concurrent work that their author had not seen.",
    raceLabel: "Race the document edits",
    recordLabel: "Incident report",
    messageLabel: "JSON operation",
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
    initial: ['{"crew":["Ada","Ben"],"gauge":{"stage":24,"trend":"steady"},"site":"Mill Race"}'],
    initialRecord: {
      A: '{"crew":["Ada","Ben"],"gauge":{"stage":24,"trend":"steady"},"site":"Mill Race"}',
      B: '{"crew":["Ada","Ben"],"gauge":{"stage":24,"trend":"steady"},"site":"Mill Race"}',
      C: '{"crew":["Ada","Ben"],"gauge":{"stage":24,"trend":"steady"},"site":"Mill Race"}',
    },
    local: { A: "Insert Cy at crew[0]", B: "Insert Dot at crew[0]", C: "Add 1 to gauge.stage" },
    evidence: {
      A: 'list insert · path /crew/0 · "Cy"',
      B: 'list insert · path /crew/0 · "Dot"',
      C: "number add · path /gauge/stage · +1",
    },
    result: "All three reports contain Cy and Dot in one deterministic crew order, and the nested gauge stage is 25. Bob's insertion path shifts when it is transformed past Alice's earlier sequenced insertion.",
  },
  {
    id: "rich-text-ot",
    glossaryId: "richtextot",
    family: "sequences",
    kind: "OT",
    name: "RichTextOt",
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
  maps: {
    name: "Maps",
    tagline: "Store named values and transform concurrent document changes.",
    intro: "Maps organize values by name. Some choose one value for each key; JsonOt instead transforms concurrent edits to different paths in one JSON document.",
  },
  sequences: {
    name: "Sequences",
    tagline: "Keep lists, plain text, and formatted text in order.",
    intro: "Alice and Bob edit separate copies of the ranger's route and reports. Sequence structures preserve ordered items, written symbols, and formatting when their changes meet.",
  },
  coordination: {
    name: "Coordination",
    tagline: "Choose one owner, one worker, or one accepted value.",
    intro: "Every structure in this family is a distributed data structure. The ranger's sequencer numbers accepted operations, so every replica applies one shared order before it chooses an owner, worker, queue position, or agreed value.",
  },
};

export function structuresForFamily(family: RemainingFamily): RemainingStructure[] {
  return remainingStructures.filter((structure) => structure.family === family);
}

export function structureById(id: string): RemainingStructure | undefined {
  return remainingStructures.find((structure) => structure.id === id);
}
