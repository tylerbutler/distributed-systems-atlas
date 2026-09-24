import { expect, test } from "@playwright/test";

const examples = [
  ["shared-sequence", "SharedSequence", "Race the route insertions", ["Bridge", "Weir", "North gate"], ["Bridge", "Falls", "Marsh", "Weir", "North gate"]],
  ["shared-text", "SharedText", "Race the field-note edits", ["The weir is clear."], ["The still calm weir is clear."]],
  ["claims", "Claims", "Race the gate-key claims", ["gate-key: unclaimed"], ["gate-key: Alice"]],
  ["ordered-collection", "OrderedCollection", "Race to acquire the inspection", ["Queue: inspect bridge"], ["Alice owns inspect bridge", "Queue empty"]],
  ["task-manager", "TaskManager", "Queue the dispatcher volunteers", ["dispatcher: unassigned"], ["dispatcher: Alice", "waiting: Bob, Carol"]],
  ["pact-map", "PactMap", "Propose and sign off the closure", ["closure-target: absent"], ["closure-target: ridge-pass", "accepted by A, B, C"]],
  ["json-ot", "JsonOt", "Race the report edits", ["{}"], ['{"revision":1,"title":"field notes"}']],
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
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [family, names] of [
    ["sequences", ["SharedSequence", "SharedText"]],
    ["coordination", ["Claims", "OrderedCollection", "TaskManager", "PactMap"]],
    ["transforms", ["JsonOt", "SharedRichText"]],
  ] as const) {
    await page.goto(`/structures/${family}/`);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator(".page-intro .territory-label")).toHaveText("Structure family");
    expect(await page.locator(".page-intro").evaluate((element) => element.getBoundingClientRect().width))
      .toBeLessThanOrEqual(710);
    await expect(page.locator(".structure-family > section")).toHaveCount(names.length);
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
      if (slug === "shared-sequence") {
        await expect(page.getByRole("table", {
          name: "Each hiker's inspection route before and after sharing",
        })).toContainText("Bridge · Falls · Marsh · Weir · North gate");
        await expect(page.getByRole("heading", { name: "Quick facts" })).toBeVisible();
      }
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
  await expect(demo.locator("[data-status]")).toContainText("can still send theirs");
});

test("SharedSequence shows each local route and the insertion notes in transit", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  await expect(demo.locator('[data-client="C"] [data-client-action]')).toHaveCount(0);
  await demo.locator("[data-transport-auto-deliver]").uncheck();
  await demo.getByRole("button", { name: "Insert Falls" }).click();
  await expect(demo.locator("[data-local-record]")).toHaveText([
    "Bridge · Falls · Weir · North gate",
    "Bridge · Weir · North gate",
    "Bridge · Weir · North gate",
  ]);
  await expect(demo.getByRole("region", { name: "Carol's current route" }))
    .toContainText("BridgeWeirNorth gate");
  await expect(demo.locator("[data-pending]")).toHaveText("1 note waiting");
  await expect(demo.getByRole("list", { name: "Insertion note log" }))
    .toContainText("Alice: Insert Falls before Weir — waiting");

  await demo.getByRole("button", { name: "Insert Marsh" }).click();
  await expect(demo.locator("[data-pending]")).toHaveText("2 notes waiting");
  await demo.locator("[data-transport-auto-deliver]").check();
  await expect(demo.locator("[data-pending]")).toHaveText("0 notes waiting");
  await expect(demo.locator("[data-local-record]")).toHaveText([
    "Bridge · Falls · Marsh · Weir · North gate",
    "Bridge · Falls · Marsh · Weir · North gate",
    "Bridge · Falls · Marsh · Weir · North gate",
  ]);
  await expect(demo.getByRole("list", { name: "Insertion note log" }))
    .toContainText("Bob: Insert Marsh before Weir — delivered");
  await demo.getByRole("button", { name: "Reset" }).click();
  await expect(demo.locator("[data-pending]")).toHaveText("0 notes waiting");
  await expect(demo.getByRole("list", { name: "Insertion note log" }))
    .toHaveText("No insertion notes yet.");
});

test("SharedSequence uses the reading column and a wider sandbox", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/structures/shared-sequence/");
    const article = page.locator(".structure-lesson");
    const demo = page.getByTestId("shared-sequence-demo");
    const facts = page.locator(".structure-facts");
    const articleBox = await article.boundingBox();
    const demoBox = await demo.boundingBox();
    const factsBox = await facts.boundingBox();
    expect(articleBox!.width).toBeLessThanOrEqual(710);
    expect(demoBox!.width).toBeGreaterThanOrEqual(articleBox!.width);
    expect(demoBox!.x).toBeGreaterThanOrEqual(0);
    expect(demoBox!.x + demoBox!.width).toBeLessThanOrEqual(width);
    expect(factsBox!.y + factsBox!.height).toBeLessThan(demoBox!.y);
    expect(factsBox!.x).toBeGreaterThanOrEqual(0);
    expect(factsBox!.x + factsBox!.width).toBeLessThanOrEqual(width);
    await expect(demo.locator(".remaining-demo")).toHaveCSS("background-color", "oklch(0.29 0.075 238)");
    await expect(article.getByRole("navigation", { name: "SharedSequence lesson map" }))
      .toBeVisible();
    await expect(article.getByRole("heading", { name: "Quick facts" })).toBeVisible();
    await expect(article.getByRole("table", { name: "Each hiker's inspection route before and after sharing" }))
      .toBeVisible();
  }
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
  await expect(demo.locator("[data-error]")).toContainText("change failed");
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

test("model and lesson prose distinguish local edits from sequenced outcomes", async ({ page }) => {
  await page.goto("/structures/models/");
  const dds = page.locator("#dds");
  await expect(dds).toContainText("SharedCounter, SharedMap, and SharedDirectory show an author's change locally before it has a number.");
  await expect(dds).toContainText("Claims, RegisterCollection, and OrderedCollection wait for a number");
  await expect(dds).toContainText("TaskManager tracks a pending volunteer locally but waits for sequencing");
  await expect(dds).toContainText("PactMap waits for sequencing to show a pending proposal");
  await expect(page.locator("#ot")).toContainText("Both show local edits before the sequencer confirms them.");
  await expect(page.getByRole("row", { name: /Local change before shared order/ })).toContainText("Yes; the edit stays pending");
  await expect(page.getByRole("heading", { name: "Before the sequencer replies" })).toBeVisible();
  await expect(page.locator(".local-visibility")).toContainText("Their clients send one operation at a time and buffer further local edits");

  for (const [slug, detail] of [
    ["shared-counter", "The local update is optimistic."],
    ["shared-map", "Alice sees her own note as soon as she writes it."],
    ["shared-directory", "Alice can use her new folder and see the notes she adds or removes"],
    ["register-collection", "Writes stay hidden until the sequencer"],
    ["claims", "her ledger still shows that nobody holds the gate key"],
    ["ordered-collection", "None can mark the inspection as theirs until a numbered request"],
    ["task-manager", "She cannot mark herself assigned or even confirmed in the queue until"],
    ["pact-map", "Only after the required stations sign off can anyone read the new value."],
    ["json-ot", "Alice sees her title edit before the ranger gives it a number"],
    ["shared-rich-text", "Alice sees the bold heading as soon as she edits it"],
  ] as const) {
    await page.goto(`/structures/${slug}/`);
    await expect(page.locator("article").first()).toContainText(detail);
  }
});
