import type { GlossaryTerm } from "./graph";

export const replicaTerm: GlossaryTerm = {
  term: "replica",
  definition: "A local copy of shared data that can change independently and merge messages from other copies.",
};

export const eventualConsistencyTerm: GlossaryTerm = {
  term: "eventual consistency",
  definition: "Replicas can disagree while messages are in transit. After every message arrives, they converge on the same value.",
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

export const standaloneTerms = [
  eventualConsistencyTerm,
  gSetTerm,
  lwwRegisterTerm,
  pnCounterTerm,
  replicaTerm,
  registerCollectionTerm,
  sequencerTerm,
  sharedCounterTerm,
  twoPSetTerm,
];
