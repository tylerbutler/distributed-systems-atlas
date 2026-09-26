export const complexityLevels = [
  "introductory",
  "intermediate",
  "advanced",
  "expert",
] as const;

export type LearningComplexity = typeof complexityLevels[number];

export const complexityLabels: Record<LearningComplexity, string> = {
  introductory: "Introductory",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

const structureComplexities: Record<string, LearningComplexity> = {
  "g-counter": "introductory",
  "pn-counter": "intermediate",
  "shared-counter": "intermediate",
  "g-set": "introductory",
  "two-p-set": "introductory",
  "observed-remove-set": "advanced",
  "lww-register": "introductory",
  "multi-value-register": "intermediate",
  "register-map": "advanced",
  "shared-map": "intermediate",
  "lww-map": "intermediate",
  "or-map": "advanced",
  "shared-directory": "advanced",
  "shared-sequence": "advanced",
  "shared-text": "expert",
  claims: "intermediate",
  "fifo-work-queue": "advanced",
  "task-manager": "advanced",
  "pact-map": "expert",
  "json-ot": "expert",
  "shared-rich-text": "expert",
};

export function structureComplexity(idOrPath: string): LearningComplexity {
  const id = idOrPath.match(/\/structures\/([^/]+)\/?$/)?.[1] ?? idOrPath;
  const complexity = structureComplexities[id];
  if (!complexity) throw new Error(`Missing complexity for structure lesson: ${id}`);
  return complexity;
}
