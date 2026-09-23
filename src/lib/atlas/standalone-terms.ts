import type { GlossaryTerm } from "./graph";

export const replicaTerm: GlossaryTerm = {
  term: "replica",
  definition: "A local copy of shared data that can change independently and merge messages from other copies.",
};

export const crdtTerm: GlossaryTerm = {
  term: "CRDT",
  definition: "A conflict-free replicated data type combines changes with a rule that does not depend on one shared delivery order.",
};

export const ddsTerm: GlossaryTerm = {
  term: "DDS",
  definition: "A distributed data structure uses one shared order of accepted operations to keep every copy in agreement.",
};

export const otTerm: GlossaryTerm = {
  term: "operational transform",
  definition: "A collaboration model that rewrites operations against changes made at the same time before it applies them.",
};

export const eventualConsistencyTerm: GlossaryTerm = {
  term: "eventual consistency",
  definition: "Each replica sees only the updates it has received, so its current view can be incomplete and can differ from the others. Once updates stop and all remaining messages arrive, every replica eventually converges on the same state.",
};

export const gCounterTerm: GlossaryTerm = {
  term: "G-counter",
  definition: "A grow-only replicated counter that gives each replica its own nondecreasing component, merges each component by maximum, and sums the components for the total.",
};

export const pnCounterTerm: GlossaryTerm = {
  term: "PN-counter",
  definition: "A replicated counter that stores increases and decreases in separate grow-only components, then subtracts their totals.",
};

export const sequencerTerm: GlossaryTerm = {
  term: "sequencer",
  definition: "A service that assigns ordered sequence numbers to accepted operations and broadcasts the numbered stream to replicas.",
};

export const sharedCounterTerm: GlossaryTerm = {
  term: "SharedCounter",
  definition: "A sequenced distributed counter that applies signed delta operations to one shared integer.",
};

export const sluiceTerm: GlossaryTerm = {
  term: "Sluice",
  definition: "Watershed's in-memory server for one collaborative document. It connects clients, sequences their operations, and lets tests or demos control when messages are delivered.",
};

export const gSetTerm: GlossaryTerm = {
  term: "GSet",
  definition: "A grow-only replicated set whose replicas merge by taking the union of their members.",
};

export const twoPSetTerm: GlossaryTerm = {
  term: "TwoPSet",
  definition: "A two-phase replicated set composed of two GSets: one records additions and one records permanent removals. Each value can move from absent, to present, to permanently removed.",
};

export const lwwRegisterTerm: GlossaryTerm = {
  term: "last-writer-wins register",
  definition: "A replicated register that keeps the value with the greatest timestamp and uses the writer ID to break equal-time ties.",
};

export const registerCollectionTerm: GlossaryTerm = {
  term: "RegisterCollection",
  definition: "A sequenced collection of named registers that retains competing versions so readers can choose an atomic or latest-value policy.",
};

export const sharedMapTerm: GlossaryTerm = {
  term: "SharedMap",
  definition: "A map of named entries where a service numbers each accepted change. The highest number for each name decides what everyone sees.",
};

export const lwwMapTerm: GlossaryTerm = {
  term: "LWWMap",
  definition: "A map where each named entry keeps the answer or removal with the latest time. At equal times, removal wins; the writer ID breaks a tie between answers.",
};

export const orMapTerm: GlossaryTerm = {
  term: "OR-map",
  definition: "A map where removing a named entry affects only the version someone has seen. A new change made at the same time can keep the entry present.",
};

export const sharedDirectoryTerm: GlossaryTerm = {
  term: "SharedDirectory",
  definition: "A shared folder tree where a service numbers changes. A new folder stays distinct from an old folder with the same name.",
};

export const sharedSequenceTerm: GlossaryTerm = {
  term: "SharedSequence",
  definition: "A shared ordered list where each item has its own mark. People can add, move, replace, or remove items without losing track of which one they mean.",
};

export const sharedTextTerm: GlossaryTerm = {
  term: "SharedText",
  definition: "A shared text where each written symbol has its own mark. People can add, remove, or replace text at the same time without splitting a symbol.",
};

export const claimsTerm: GlossaryTerm = {
  term: "Claims",
  definition: "A list of named responsibilities where the first accepted, numbered claim picks an owner who cannot be replaced.",
};

export const orderedCollectionTerm: GlossaryTerm = {
  term: "OrderedCollection",
  definition: "A shared work queue where a service numbers requests and gives each job to one requester.",
};

export const taskManagerTerm: GlossaryTerm = {
  term: "TaskManager",
  definition: "A duty roster with one person assigned to each task. Volunteers wait in order so the next connected person can take over.",
};

export const pactMapTerm: GlossaryTerm = {
  term: "PactMap",
  definition: "A list of proposed changes where every station on the connected roster must sign off before anyone uses the new answer.",
};

export const jsonOtTerm: GlossaryTerm = {
  term: "JsonOt",
  definition: "A shared JSON report that adjusts edits made at the same time so changes to separate fields can both remain.",
};

export const sharedRichTextTerm: GlossaryTerm = {
  term: "SharedRichText",
  definition: "A shared report that adjusts simultaneous text and formatting edits so both hikers' changes can remain.",
};

export const standaloneTerms = [
  claimsTerm,
  crdtTerm,
  ddsTerm,
  eventualConsistencyTerm,
  gCounterTerm,
  gSetTerm,
  jsonOtTerm,
  lwwRegisterTerm,
  lwwMapTerm,
  orderedCollectionTerm,
  otTerm,
  orMapTerm,
  pactMapTerm,
  pnCounterTerm,
  replicaTerm,
  registerCollectionTerm,
  sequencerTerm,
  sharedDirectoryTerm,
  sharedCounterTerm,
  sharedMapTerm,
  sharedRichTextTerm,
  sharedSequenceTerm,
  sharedTextTerm,
  sluiceTerm,
  taskManagerTerm,
  twoPSetTerm,
];
