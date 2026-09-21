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

export const standaloneTerms = [
  eventualConsistencyTerm,
  pnCounterTerm,
  replicaTerm,
  sequencerTerm,
  sharedCounterTerm,
];
