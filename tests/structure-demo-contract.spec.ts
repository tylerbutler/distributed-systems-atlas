import { expect, test, type Locator } from "@playwright/test";
import { structureGroups } from "../src/lib/structure-demo/structure-navigation";

interface LessonCase {
  id?: string;
  replicas: string;
  metadata?: string;
  initial?: string;
  actions?: string[];
  reset?: string;
  result: string;
  expected: string[];
}

const three = (value: string) => [value, value, value];
const cases: Record<string, LessonCase> = {
  "g-counter": { replicas: "[data-total]", initial: "0", result: "[data-total]", expected: three("10") },
  "pn-counter": { replicas: "[data-pn-total]", initial: "10", result: "[data-pn-total]", expected: three("12") },
  "shared-counter": { replicas: "[data-shared-total]", initial: "10", result: "[data-shared-total]", expected: three("12") },
  "g-set": { replicas: "[data-member-list]", result: "[data-member-list] > span", expected: Array(3).fill(["Eagle Creek", "Ridge Pass"]).flat() },
  "two-p-set": { replicas: "[data-member-list]", result: "[data-member-list]", expected: three("Empty set") },
  "observed-remove-set": { id: "or-set-demo", replicas: "[data-member-list]", metadata: "[data-additions-page], [data-highest-tag]", result: "[data-member-list] > span", expected: three("Eagle CreekB:2") },
  "lww-register": { replicas: "[data-register-values]", initial: "No status", result: "[data-register-values] > span", expected: three("Trail closed") },
  "multi-value-register": { id: "mv-register-demo", replicas: "[data-register-values]", initial: "No status", result: "[data-register-values] > span", expected: Array(3).fill(["Trail closed", "Trail open"]).flat() },
  "register-map": { replicas: "[data-register-values]", initial: "No fields", result: "[data-register-values] > span", expected: Array(3).fill(["radio-channel: Channel 4", "trail-status: Trail open"]).flat() },
  "shared-map": { replicas: "[data-map-entries]", result: "[data-map-entries] div", expected: Array(3).fill(["LineReport", "bridge-statusInspection due", "gate-statusTrail closed"]).flat() },
  "lww-map": { replicas: "[data-map-entries]", result: "[data-map-entries]", expected: three("gate-statusTrail closed") },
  "or-map": { replicas: "[data-map-entries]", result: "[data-map-entries]", expected: three("Eagle Creek8") },
  "shared-directory": { replicas: "[data-map-entries]", result: "[data-map-entries]", expected: three("eagle-creekfolder") },
  "sequence-crdt": { replicas: "[data-local-record]", metadata: "[data-state] li", result: "[data-state] li", expected: ["Bridge", "FallsA:4", "MarshB:4", "Weir", "North gate"] },
  "text-crdt": { replicas: "[data-local-record]", initial: "The weir is clear.", metadata: "[data-state] li", result: "[data-state] li", expected: ["The still calm weir is clear."] },
  claims: { replicas: "[data-local-record]", metadata: "[data-state] li", result: "[data-state] li", expected: ["gate-key: Alice"] },
  "rich-text-ot": { replicas: "[data-local-record]", initial: "Hello World", metadata: "[data-state] li", result: "[data-state] li", expected: ["Hello [bold] World ▲"] },
  "fifo-work-queue": { replicas: "[data-held]", metadata: "[data-queue], [data-active], [data-done], [data-sequence]", initial: "None", actions: ["[data-worked-example]"], reset: "[data-reset]", result: "[data-queue] li", expected: ["1. inspect bridge"] },
  "task-manager": { replicas: "[data-roster-status]", metadata: "[data-assigned], [data-waiting], [data-task-state], [data-sequence]", initial: "Not volunteering", actions: ["[data-worked-example]"], reset: "[data-reset]", result: "[data-task-state] li", expected: ["Dispatch task completed."] },
  "pact-map": { replicas: "[data-pact-status]", metadata: "[data-accepted], [data-pending-value], [data-signoffs], [data-sequence]", initial: "Connected", actions: ["[data-worked-example]"], reset: "[data-reset]", result: "[data-accepted] li", expected: ["ridge-pass"] },
  "json-ot": { replicas: "[data-document]", metadata: "[data-shared-crew], [data-shared-stage], [data-sequence]", actions: ["[data-worked-example]"], reset: "[data-reset]", result: "[data-shared-crew] li", expected: ["0: Cy", "1: Dot", "2: Ada", "3: Ben"] },
};

async function values(root: Locator, selector: string) {
  return root.locator(selector).evaluateAll((nodes) => nodes.map((node) => {
    if (node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement) return node.value;
    const text = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    const parts: string[] = [];
    while (text.nextNode()) {
      const part = text.currentNode.textContent?.replace(/\s+/g, " ").trim();
      if (part) parts.push(part);
    }
    const value = parts.join(" ");
    return value.replace(/\s+/g, " ").trim();
  }));
}

async function snapshot(root: Locator, lesson: LessonCase) {
  return {
    replicas: await values(root, lesson.replicas),
    metadata: await values(root, [
      "[data-user-count]", "[data-sequence-counter]", "[data-message-count]",
      "[data-sequence-number]", "[data-pending]", "[data-pending-count]",
      ...(lesson.metadata ? [lesson.metadata] : []),
    ].join(", ")),
  };
}

const lessons = structureGroups.flatMap((group) => group.lessons.map(([label, slug]) => ({
  label, slug, href: `/structures/${slug}/`,
})));

test("the contract covers exactly the published individual lessons", () => {
  expect(Object.keys(cases).sort()).toEqual(lessons.map((lesson) => lesson.slug).sort());
});

for (const lesson of lessons) {
  test(`${lesson.label}: static, hydrated, guided result, and reset agree`, async ({ browser, page }) => {
    const contract = cases[lesson.slug];
    const id = contract.id ?? `${lesson.slug}-demo`;
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    try {
      const staticPage = await staticContext.newPage();
      await staticPage.goto(lesson.href);
      const initial = await snapshot(staticPage.getByTestId(id), contract);
      expect(initial.replicas).toHaveLength(3);
      if (contract.initial) expect(initial.replicas).toEqual(three(contract.initial));

      await page.goto(lesson.href);
      const demo = page.getByTestId(id);
      await expect(demo).toHaveAttribute("data-ready", "true");
      expect(await snapshot(demo, contract)).toEqual(initial);

      const actions = contract.actions ?? ['[data-action="race"]'];
      let actionCount = 0;
      for (const selector of actions) {
        await demo.locator(selector).click();
        actionCount += 1;
      }
      expect(actionCount).toBeGreaterThan(0);
      expect(actionCount).toBeLessThanOrEqual(3);
      await expect(demo.locator(contract.result)).toHaveText(contract.expected);

      await demo.locator(contract.reset ?? '[data-action="reset"]').click();
      await expect.poll(() => snapshot(demo, contract)).toEqual(initial);
    } finally {
      await staticContext.close();
    }
  });
}
