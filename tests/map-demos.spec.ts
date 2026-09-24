import { expect, test } from "@playwright/test";

for (const example of [
  {
    path: "/structures/shared-map/",
    testId: "shared-map-demo",
    heading: "SharedMap",
    race: "Race the two gate-status notes",
    entries: ["LineReport", "bridge-statusInspection due", "gate-statusTrail closed"],
    evidence: /^Ledger number \d+: gate-status uses the last numbered note\.$/,
  },
  {
    path: "/structures/lww-map/",
    testId: "lww-map-demo",
    heading: "LWWMap",
    race: "Race the dated gate-status notes",
    entries: ["gate-statusTrail closed"],
    evidence: "Carol compares the times beside gate-status and reads Trail closed, regardless of delivery order.",
  },
  {
    path: "/structures/or-map/",
    testId: "or-map-demo",
    heading: "OR-map",
    race: "Race removal against the 3-crate delivery",
    entries: ["Eagle Creek8"],
    evidence: "Alice crossed out the entry she saw; Bob's new note of 3 crates remains.",
  },
  {
    path: "/structures/shared-directory/",
    testId: "shared-directory-demo",
    heading: "SharedDirectory",
    race: "Race the Eagle Creek folder creates",
    entries: ["eagle-creekfolder"],
    evidence: "Alice and Bob's two notes now refer to one eagle-creek folder.",
  },
]) {
  test(`${example.testId} runs its three-client authored race`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(example.path);
    const demo = page.getByTestId(example.testId);
    const race = demo.getByRole("button", { name: example.race });

    await expect(demo.locator("[data-client]")).toHaveCount(3);
    await expect(demo.getByText("Note to share", { exact: true })).toHaveCount(3);
    await expect(demo.locator(".map-edit-slip").first()).not.toContainText(
      "No slip in this race",
    );
    await race.click();
    for (const entries of await demo.locator("[data-map-entries]").all()) {
      await expect(entries.locator("div")).toHaveText(example.entries);
    }
    await expect(demo.locator("[data-evidence]")).toHaveText(example.evidence);
    await expect(race).toBeFocused();
  });

  test(`${example.testId} remains useful without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(example.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(example.heading);
      const demo = page.getByTestId(example.testId);
      await expect(demo.locator("[data-client]")).toHaveCount(3);
      await expect(demo.getByRole("button").first()).toBeDisabled();
      await expect(demo).toContainText("Enable JavaScript to run the demo");
    } finally {
      await context.close();
    }
  });
}

test("map controls stay active while operations travel", async ({ page }) => {
  await page.goto("/structures/shared-map/");
  const demo = page.getByTestId("shared-map-demo");
  const alice = demo.getByRole("button", { name: "Write Trail open" });
  const carol = demo.getByRole("button", { name: "Write Bridge clear" });

  await alice.click();
  await expect(demo.locator(".map-operation-pulse")).toContainText("Trail open");
  await expect(carol).toBeEnabled();
  await carol.click();
  for (const entries of await demo.locator("[data-map-entries]").all()) {
    await expect(entries.locator("div:not(.map-entry-heading)")).toHaveText([
      "bridge-statusBridge clear",
      "gate-statusTrail open",
    ], { timeout: 10_000 });
  }
  await expect(demo.locator("[data-evidence]"))
    .toContainText("bridge-status uses the last numbered note.");
  await expect(demo.locator('[role="status"]'))
    .toContainText("Every hiker sees Bridge clear on that line.");
});

test("map replicas update after the shared operation arrives", async ({ page }) => {
  await page.goto("/structures/shared-map/");
  const demo = page.getByTestId("shared-map-demo");

  await demo.getByRole("button", { name: "Write Trail open" }).click();
  await expect(demo.locator(".map-operation-pulse.shared").first()).toBeVisible();
  await expect(demo.locator('[data-client="A"] [data-map-entries] div:not(.map-entry-heading)'))
    .toHaveText(["bridge-statusInspection due", "gate-statusTrail open"]);
  for (const client of ["B", "C"]) {
    await expect(demo.locator(`[data-client="${client}"] [data-map-entries] div:not(.map-entry-heading)`))
      .toHaveText(["bridge-statusInspection due", "gate-statusReport pending"]);
  }

  for (const entries of await demo.locator("[data-map-entries]").all()) {
    await expect(entries.locator("div:not(.map-entry-heading)")).toHaveText([
      "bridge-statusInspection due",
      "gate-statusTrail open",
    ], { timeout: 10_000 });
  }
});

test("the map family links every dedicated lesson", async ({ page }) => {
  await page.goto("/structures/maps/");
  for (const [name, href] of [
    ["Open the SharedMap lesson", "/structures/shared-map/"],
    ["Open the LWWMap lesson", "/structures/lww-map/"],
    ["Open the OR-map lesson", "/structures/or-map/"],
    ["Open the SharedDirectory lesson", "/structures/shared-directory/"],
  ]) {
    await expect(page.getByRole("link", { name })).toHaveAttribute("href", href);
  }
});

test("LWWMap explains its name and timestamp rule without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/structures/lww-map/");
    await expect(page.getByRole("region", { name: "A time beside each line" }))
      .toContainText('LWW stands for "last writer wins."');
    await expect(page.getByLabel("LWWMap definition"))
      .toContainText("Clock skew means the greatest timestamp may not mark the last edit in real time.");
    await expect(page.locator("dfn").first().getByRole("link", { name: "LWWMap" }))
      .toHaveAttribute("href", "/glossary/#lwwmap");
  } finally {
    await context.close();
  }
});

test("reset restores a new map room", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-map/");
  const demo = page.getByTestId("shared-map-demo");
  await demo.getByRole("button", { name: "Race the two gate-status notes" }).click();
  await demo.getByRole("button", { name: "Reset", exact: true }).click();
  for (const entries of await demo.locator("[data-map-entries]").all()) {
    await expect(entries.locator("div:not(.map-entry-heading)")).toHaveText([
      "bridge-statusInspection due",
      "gate-statusReport pending",
    ]);
  }
  await expect(demo.locator("[data-evidence]")).toHaveText("No race delivered yet.");
});
