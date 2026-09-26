import { describe, expect, test } from "vitest";
import { structureGroups } from "./structure-demo/structure-navigation";
import { complexityLevels, structureComplexity } from "./learning-complexity";
import { scenarioIds, scenarioById } from "./lab/scenarios";

describe("learning complexity", () => {
  test("classifies every structure lesson", () => {
    for (const group of structureGroups) {
      for (const [, id] of group.lessons) {
        expect(complexityLevels).toContain(structureComplexity(id));
      }
    }
  });

  test("classifies every lab", () => {
    for (const id of scenarioIds()) {
      expect(complexityLevels).toContain(scenarioById(id).complexity);
    }
  });
});
