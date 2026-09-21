import type { GlossaryTerm } from "./graph";

export const replicaTerm: GlossaryTerm = {
  term: "replica",
  definition: "A local copy of shared data that can change independently and merge messages from other copies.",
};

export const eventualConsistencyTerm: GlossaryTerm = {
  term: "eventual consistency",
  definition: "Replicas can disagree while messages are in transit. After delivery of every message, they converge on the same value.",
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

export const gSetTerm: GlossaryTerm = {
  term: "GSet",
  definition: "A grow-only replicated set whose replicas merge by taking the union of their members.",
};

export const twoPSetTerm: GlossaryTerm = {
  term: "TwoPSet",
  definition: "A replicated set with grow-only addition and removal sets, where a removed value cannot be added again.",
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
  definition: "A sequenced key-value map that uses the highest server sequence number for each key.",
};

export const lwwMapTerm: GlossaryTerm = {
  term: "LWWMap",
  definition: "A replicated map where each key keeps the value or tombstone with the greatest timestamp and writer tie-breaker.",
};

export const orMapTerm: GlossaryTerm = {
  term: "OR-map",
  definition: "An observed-remove map whose key identities let a concurrent update survive removal.",
};

export const sharedDirectoryTerm: GlossaryTerm = {
  term: "SharedDirectory",
  definition: "A sequenced hierarchical map whose folders retain stable identities across concurrent create, delete, and recreate operations.",
};

export const sharedSequenceTerm: GlossaryTerm = {
  term: "SharedSequence",
  definition: "A replicated ordered list whose items keep stable identities while clients insert, move, replace, or delete by index.",
};

export const sharedTextTerm: GlossaryTerm = {
  term: "SharedText",
  definition: "A collaborative string whose graphemes keep stable identities across concurrent insertion, deletion, and replacement.",
};

export const claimsTerm: GlossaryTerm = {
  term: "Claims",
  definition: "A sequenced write-once key collection where the first accepted claim becomes the committed owner.",
};

export const orderedCollectionTerm: GlossaryTerm = {
  term: "OrderedCollection",
  definition: "A sequenced work queue that grants each item to one accepted acquire operation.",
};

export const taskManagerTerm: GlossaryTerm = {
  term: "TaskManager",
  definition: "A coordination structure that assigns one client per named task and keeps a FIFO volunteer queue for failover.",
};

export const pactMapTerm: GlossaryTerm = {
  term: "PactMap",
  definition: "A coordinated map whose proposed value becomes accepted only after the expected connected clients sign off.",
};

export const jsonOtTerm: GlossaryTerm = {
  term: "JsonOt",
  definition: "A collaborative JSON document that transforms concurrent path operations before it applies them.",
};

export const sharedRichTextTerm: GlossaryTerm = {
  term: "SharedRichText",
  definition: "A collaborative rich-text document that transforms concurrent retain, insert, delete, and formatting deltas.",
};

export const standaloneTerms = [
  claimsTerm,
  eventualConsistencyTerm,
  gSetTerm,
  jsonOtTerm,
  lwwRegisterTerm,
  lwwMapTerm,
  orderedCollectionTerm,
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
  taskManagerTerm,
  twoPSetTerm,
];
