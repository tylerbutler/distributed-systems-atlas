import { expect, test } from "@playwright/test";

for (const example of [
  {
    path: "/structures/shared-map/",
    testId: "shared-map-demo",
    heading: "SharedMap",
    race: "Race the two gate-status writes",
    entries: ["gate-statusTrail closed"],
    evidence: /^SN \d+: the last sequenced write wins gate-status\.$/,
  },
  {
    path: "/structures/lww-map/",
    testId: "lww-map-demo",
    heading: "LWWMap",
    race: "Race the timestamped gate writes",
    entries: ["gate-statusTrail closed"],
    evidence: "The per-key timestamp selects Trail closed, independent of arrival order.",
  },
  {
    path: "/structures/or-map/",
    testId: "or-map-demo",
    heading: "OR-map",
    race: "Race removal against the 3-crate delivery",
    entries: ["Eagle Creek8"],
    evidence: "Alice removed the observed key; Bob's unseen +3 tag survives.",
  },
  {
    path: "/structures/shared-directory/",
    testId: "shared-directory-demo",
    heading: "SharedDirectory",
    race: "Race the Eagle Creek folder creates",
    entries: ["eagle-creekfolder"],
    evidence: "Two concurrent creates resolve to one eagle-creek path.",
  },
]) {
  test(`${example.testId} runs its three-client authored race`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(example.path);
    const demo = page.getByTestId(example.testId);
    const race = demo.getByRole("button", { name: example.race });

    await expect(demo.locator("[data-client]")).toHaveCount(3);
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
  const carol = demo.getByRole("button", { name: "Write Inspect bridge" });

  await alice.click();
  await expect(demo.locator(".map-operation-pulse")).toContainText("Trail open");
  await expect(carol).toBeEnabled();
  await carol.click();
  await expect(demo.locator("[data-map-entries] dd")).toHaveText([
    "Inspect bridge",
    "Inspect bridge",
    "Inspect bridge",
  ], { timeout: 10_000 });
});

test("map replicas update after the shared operation arrives", async ({ page }) => {
  await page.goto("/structures/shared-map/");
  const demo = page.getByTestId("shared-map-demo");

  await demo.getByRole("button", { name: "Write Trail open" }).click();
  await expect(demo.locator(".map-operation-pulse.shared").first()).toBeVisible();
  await expect(demo.locator("[data-map-entries] dd")).toHaveText([
    "Trail open",
    "No entries",
    "No entries",
  ]);

  await expect(demo.locator("[data-map-entries] dd")).toHaveText([
    "Trail open",
    "Trail open",
    "Trail open",
  ], { timeout: 10_000 });
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

test("reset restores a new map room", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-map/");
  const demo = page.getByTestId("shared-map-demo");
  await demo.getByRole("button", { name: "Race the two gate-status writes" }).click();
  await demo.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(demo.locator("[data-map-entries] dd")).toHaveText([
    "No entries",
    "No entries",
    "No entries",
  ]);
  await expect(demo.locator("[data-evidence]")).toHaveText("No race delivered yet.");
});
