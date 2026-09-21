import { expect, test } from "@playwright/test";

const examples = [
  ["shared-sequence", "SharedSequence", "Race the route insertions", ["Bridge", "Falls", "Marsh", "Weir", "North gate"]],
  ["shared-text", "SharedText", "Race the field-note edits", ["The still calm weir is clear."]],
  ["claims", "Claims", "Race the gate-key claims", ["gate-key: Alice"]],
  ["ordered-collection", "OrderedCollection", "Race to acquire the inspection", ["Alice owns inspect bridge", "Queue empty"]],
  ["task-manager", "TaskManager", "Queue the dispatcher volunteers", ["dispatcher: Alice", "waiting: Bob, Carol"]],
  ["pact-map", "PactMap", "Propose and sign off the closure", ["closure-target: ridge-pass", "accepted by A, B, C"]],
  ["json-ot", "JsonOt", "Race the JSON field edits", ['{"title":"field notes","revision":1}']],
  ["shared-rich-text", "SharedRichText", "Race formatting and insertion", ["Hello [bold] World ▲"]],
] as const;

for (const [slug, name, race, final] of examples) {
  test(`${name} runs a three-client authored race`, async ({ page }) => {
    await page.goto(`/structures/${slug}/`);
    const demo = page.getByTestId(`${slug}-demo`);
    await expect(demo.locator("[data-client]")).toHaveCount(3);
    await demo.getByRole("button", { name: race }).click();
    await expect(demo.locator("[data-state] li")).toHaveText(final);
  });
}

test("remaining family pages link every dedicated lesson", async ({ page }) => {
  for (const [family, names] of [
    ["sequences", ["SharedSequence", "SharedText"]],
    ["coordination", ["Claims", "OrderedCollection", "TaskManager", "PactMap"]],
    ["transforms", ["JsonOt", "SharedRichText"]],
  ] as const) {
    await page.goto(`/structures/${family}/`);
    for (const name of names) {
      await expect(page.getByRole("link", { name: `Open the ${name} lesson` })).toBeVisible();
    }
  }
});

test("remaining lessons retain content without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const [slug, name] of examples) {
      await page.goto(`/structures/${slug}/`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
      const demo = page.getByTestId(`${slug}-demo`);
      await expect(demo.locator("[data-client]")).toHaveCount(3);
      await expect(demo.getByRole("button").first()).toBeDisabled();
      await expect(demo).toContainText("Enable JavaScript to run the race");
    }
  } finally {
    await context.close();
  }
});

test("direct controls remain active after another client queues work", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  const controls = demo.locator("[data-client-action]");
  await controls.first().click();
  await expect(controls.nth(1)).toBeEnabled();
  await controls.nth(1).click();
  await expect(demo.locator("[data-status]")).toContainText("remain available");
});
