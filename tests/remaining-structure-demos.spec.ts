import { expect, test } from "@playwright/test";

const examples = [
  ["shared-sequence", "SharedSequence", "Race the route insertions", ["Bridge", "Weir", "North gate"], ["Bridge", "Falls", "Marsh", "Weir", "North gate"]],
  ["shared-text", "SharedText", "Race the field-note edits", ["The weir is clear."], ["The still calm weir is clear."]],
  ["claims", "Claims", "Race the gate-key claims", ["gate-key: unclaimed"], ["gate-key: Alice"]],
  ["ordered-collection", "OrderedCollection", "Race to acquire the inspection", ["Queue: inspect bridge"], ["Alice owns inspect bridge", "Queue empty"]],
  ["task-manager", "TaskManager", "Queue the dispatcher volunteers", ["dispatcher: unassigned"], ["dispatcher: Alice", "waiting: Bob, Carol"]],
  ["pact-map", "PactMap", "Propose and sign off the closure", ["closure-target: absent"], ["closure-target: ridge-pass", "accepted by A, B, C"]],
  ["json-ot", "JsonOt", "Race the JSON field edits", ["{}"], ['{"revision":1,"title":"field notes"}']],
  ["shared-rich-text", "SharedRichText", "Race formatting and insertion", ["Hello World"], ["Hello [bold] World ▲"]],
] as const;

for (const [slug, name, race, initial, final] of examples) {
  test(`${name} runs a three-client authored race`, async ({ page }) => {
    await page.goto(`/structures/${slug}/`);
    const demo = page.getByTestId(`${slug}-demo`);
    await expect(demo.locator("[data-client]")).toHaveCount(3);
    await expect(demo.locator(".remaining-local-record")).toHaveCount(3);
    await expect(demo.locator(".remaining-paper-note")).toHaveCount(3);
    await expect(demo).not.toHaveAttribute("data-final");
    await demo.locator("[data-transport-auto-deliver]").uncheck();
    await demo.getByRole("button", { name: race }).click();
    await expect(demo.locator("[data-state] li")).toHaveText(initial);
    await expect(demo.locator("[data-status]")).toContainText("queued");
    await demo.locator("[data-transport-auto-deliver]").check();
    await expect(demo.locator("[data-state] li")).toHaveText(final);
    await expect(demo.locator("[data-local-record]")).toHaveText([
      final.join(" · "),
      final.join(" · "),
      final.join(" · "),
    ]);
    await demo.getByRole("button", { name: "Reset" }).click();
    await expect(demo.locator("[data-state] li")).toHaveText(initial);
    await expect(demo.locator("[data-local-record]")).toHaveText([
      initial.join(" · "),
      initial.join(" · "),
      initial.join(" · "),
    ]);
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
      await expect(demo.locator(".remaining-local-record")).toHaveCount(3);
      await expect(demo.locator(".remaining-paper-note")).toHaveCount(3);
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

test("reset cancels an in-flight kernel delivery", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  await demo.getByRole("button", { name: "Race the route insertions" }).click();
  await demo.getByRole("button", { name: "Reset" }).click();
  await page.waitForTimeout(1_000);
  await expect(demo.locator("[data-state] li")).toHaveText([
    "Bridge",
    "Weir",
    "North gate",
  ]);
});

test("kernel errors are visible and preserve the last valid state", async ({ page }) => {
  await page.goto("/structures/claims/");
  const demo = page.getByTestId("claims-demo");
  const controls = demo.locator("[data-client-action]");
  await controls.first().click();
  await expect(demo.locator("[data-state] li")).toHaveText(["gate-key: Alice"]);
  await controls.nth(1).click();
  await expect(demo.locator("[data-error]")).toContainText("operation failed");
  await expect(demo.locator("[data-state] li")).toHaveText(["gate-key: Alice"]);
});

test("a direct claim shows the kernel winner instead of the scripted race result", async ({ page }) => {
  await page.goto("/structures/claims/");
  const demo = page.getByTestId("claims-demo");
  await demo.locator('[data-client="B"] [data-client-action]').click();
  await expect(demo.locator("[data-local-record]")).toHaveText([
    "gate-key: Bob",
    "gate-key: Bob",
    "gate-key: Bob",
  ]);
  await expect(demo.locator("[data-status]")).toHaveText("Delivery complete.");
});
