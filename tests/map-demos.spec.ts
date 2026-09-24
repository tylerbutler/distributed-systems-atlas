import { expect, test } from "@playwright/test";

test("the SharedMap facts rail stays clear of the demo on wide views", async ({ page }) => {
  for (const width of [1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/structures/shared-map/");
    const facts = await page.locator(".structure-facts").boundingBox();
    const demo = await page.getByTestId("shared-map-demo").boundingBox();
    expect(facts).not.toBeNull();
    expect(demo).not.toBeNull();
    expect(facts!.x).toBeGreaterThanOrEqual(0);
    expect(facts!.x + facts!.width).toBeLessThanOrEqual(width);
    expect(facts!.y + facts!.height).toBeLessThanOrEqual(demo!.y);
  }
});

for (const example of [
  {
    path: "/structures/shared-map/",
    testId: "shared-map-demo",
    heading: "SharedMap",
    race: "Race the two gate-status notes",
    entries: ["LineReport", "bridge-statusInspection due", "gate-statusTrail closed"],
    evidence: /^Change #\d+ to gate-status is the latest for that line\.$/,
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
    evidence: /^Ledger \d+: 1 folder name in each notebook\.$/,
  },
]) {
  test(`${example.testId} runs its three-client authored race`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(example.path);
    const demo = page.getByTestId(example.testId);
    const race = demo.getByRole("button", { name: example.race });

    await expect(demo.locator("[data-client]")).toHaveCount(3);
    if (example.testId === "shared-map-demo") {
      await expect(demo.locator(".map-edit-slip")).toHaveCount(0);
      await expect(demo.locator(".map-heading")).toContainText("Change either line from any notebook.");
    } else if (example.testId !== "shared-directory-demo") {
      await expect(demo.getByText("Note to share", { exact: true })).toHaveCount(3);
      await expect(demo.locator(".map-edit-slip").first()).not.toContainText(
        "No slip in this race",
      );
    }
    await race.click();
    for (const entries of await demo.locator("[data-map-entries]").all()) {
      await expect(entries.locator("div")).toHaveText(example.entries);
    }
    await expect(demo.locator("[data-evidence]")).toHaveText(example.evidence);
    if (example.testId === "shared-map-demo") {
      const log = demo.getByRole("list", { name: "Map operation log, newest first" });
      await expect(log).toHaveCSS("list-style-type", "decimal");
      await expect(log.getByRole("listitem")).toHaveText([
        "Bob · Trail closed",
        "Alice · Trail open",
      ]);
      await expect(log.getByRole("listitem").first()).toHaveAttribute("value", "9");
      await expect(log.getByRole("listitem").last()).toHaveAttribute("value", "8");
      await expect(demo.locator(".map-sequence-note"))
        .toHaveText("The starting map uses numbers through 7. This list shows new changes.");
    }
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
  const alice = demo.locator('[data-client="A"]').getByRole("button", { name: "Write Trail open" });
  const carol = demo.locator('[data-client="C"]').getByRole("button", { name: "Write Bridge clear" });

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
  .toContainText("to bridge-status is the latest for that line.");
  await expect(demo.locator('[role="status"]'))
    .toContainText("Every hiker sees Bridge clear on that line.");
});

test("every SharedMap client can change either line", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-map/");
  const demo = page.getByTestId("shared-map-demo");
  const clients = ["A", "B", "C"].map((id) => demo.locator(`[data-client="${id}"]`));

  for (const client of clients) {
    await expect(client.locator(".map-direct-controls button")).toHaveText([
      "Write Trail open",
      "Write Trail closed",
      "Write Bridge clear",
    ]);
  }

  await demo.getByRole("checkbox", { name: "Broadcast" }).uncheck();
  await clients[1]!.getByRole("button", { name: "Write Trail open" }).click();
  await clients[2]!.getByRole("button", { name: "Write Trail closed" }).click();
  await clients[0]!.getByRole("button", { name: "Write Bridge clear" }).click();

  await expect(clients[0]!.locator("[data-map-entries] div:not(.map-entry-heading)"))
    .toHaveText(["bridge-statusBridge clear", "gate-statusReport pending"]);
  await expect(clients[1]!.locator("[data-map-entries] div:not(.map-entry-heading)"))
    .toHaveText(["bridge-statusInspection due", "gate-statusTrail open"]);
  await expect(clients[2]!.locator("[data-map-entries] div:not(.map-entry-heading)"))
    .toHaveText(["bridge-statusInspection due", "gate-statusTrail closed"]);

  await demo.getByRole("checkbox", { name: "Broadcast" }).check();
  for (const client of clients) {
    await expect(client.locator("[data-map-entries] div:not(.map-entry-heading)"))
      .toHaveText(["bridge-statusBridge clear", "gate-statusTrail closed"]);
  }
});

test("every directory client can create and remove named folders", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-directory/");
  const demo = page.getByTestId("shared-directory-demo");
  const clients = ["A", "B", "C"].map((id) => demo.locator(`[data-client="${id}"]`));
  for (const client of clients) {
    await expect(client.getByRole("textbox", { name: "Folder name" })).toHaveValue("eagle-creek");
    await expect(client.getByRole("button", { name: "Create folder" })).toBeEnabled();
    await expect(client.getByRole("button", { name: "Remove folder" })).toBeEnabled();
  }

  await demo.getByRole("checkbox", { name: "Broadcast" }).uncheck();
  await clients[0]!.getByRole("button", { name: "Create folder" }).click();
  await clients[1]!.getByRole("button", { name: "Create folder" }).click();
  await expect(clients[0]!.locator("[data-map-entries] div")).toHaveText(["eagle-creekfolder"]);
  await expect(clients[1]!.locator("[data-map-entries] div")).toHaveText(["eagle-creekfolder"]);
  await expect(clients[2]!.locator("[data-map-entries] div")).toHaveText(["No folders"]);
  await demo.getByRole("checkbox", { name: "Broadcast" }).check();
  for (const client of clients) {
    await expect(client.locator("[data-map-entries] div")).toHaveText(["eagle-creekfolder"]);
  }

  await clients[2]!.getByRole("textbox", { name: "Folder name" }).fill("ridge-pass");
  await clients[2]!.getByRole("button", { name: "Create folder" }).click();
  for (const client of clients) {
    await expect(client.locator("[data-map-entries] div"))
      .toHaveText(["eagle-creekfolder", "ridge-passfolder"]);
  }
  await clients[0]!.getByRole("button", { name: "Remove folder" }).click();
  for (const client of clients) {
    await expect(client.locator("[data-map-entries] div")).toHaveText(["ridge-passfolder"]);
  }
  await clients[1]!.getByRole("button", { name: "Create folder" }).click();
  for (const client of clients) {
    await expect(client.locator("[data-map-entries] div"))
      .toHaveText(["ridge-passfolder", "eagle-creekfolder"]);
  }
  await clients[2]!.getByRole("textbox", { name: "Folder name" }).fill("missing-folder");
  await clients[2]!.getByRole("button", { name: "Remove folder" }).click();
  await expect(demo.getByRole("alert")).toContainText("not in Carol's notebook");
  await expect(clients[2]!.locator("[data-map-entries] div"))
    .toHaveText(["ridge-passfolder", "eagle-creekfolder"]);
});

test("map replicas update after the shared operation arrives", async ({ page }) => {
  await page.goto("/structures/shared-map/");
  const demo = page.getByTestId("shared-map-demo");

  await demo.locator('[data-client="A"]').getByRole("button", { name: "Write Trail open" }).click();
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
    const notebooks = page.getByRole("table", {
      name: "LWWMap notebook lines before gate notes are shared",
    });
    await expect(notebooks.locator("tbody tr")).toHaveCount(3);
    await expect(notebooks.locator("tbody tr td:nth-child(2) time"))
      .toHaveText(["11:40 a.m.", "11:42 a.m.", "11:20 a.m."]);
    await expect(notebooks.locator("tbody tr td:last-child strong"))
      .toHaveText(["Inspection due", "Inspection due", "Inspection due"]);
    await expect(page.getByRole("region", { name: "A time beside each line" }))
      .toContainText("all three hikers record");
  } finally {
    await context.close();
  }
});

test("OR-map shows each hiker's notebook before and after the removal", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/structures/or-map/");
    await expect(page.getByRole("region", { name: "Cross out only what you have seen" }))
      .toContainText("Alice had not seen Bob's update");
    const notebooks = page.getByRole("table", { name: "OR-map notebooks at three checkpoints" });
    await expect(notebooks.locator("thead th")).toHaveText([
      "Hiker", "Before either note", "Notes not yet shared", "After sharing",
    ]);
    await expect(notebooks.locator("thead th").first()).toHaveCSS("white-space", "nowrap");
    const rows = notebooks.locator("tbody tr");
    await expect(rows.locator("th")).toHaveText(["Alice", "Bob", "Carol"]);
    await expect(rows.locator("th").first()).toHaveCSS("white-space", "nowrap");
    await expect(rows.nth(0).locator("td")).toHaveText([
      "Eagle Creek · 5 crates",
      "Eagle Creek · 5 crates",
      "Eagle Creek · 8 crates",
    ]);
    await expect(rows.nth(0).locator("del")).toHaveText("Eagle Creek · 5 crates");
    await expect(rows.nth(1).locator("td")).toHaveText([
      "Eagle Creek · 5 crates",
      "Eagle Creek · 8 crates (5 + 3)",
      "Eagle Creek · 8 crates",
    ]);
    await expect(rows.nth(2).locator("td")).toHaveText([
      "Eagle Creek · 5 crates",
      "Eagle Creek · 5 crates",
      "Eagle Creek · 8 crates",
    ]);
    const modes = page.getByRole("region", { name: "A list of names, with more inside" });
    await expect(modes).toContainText("each named line a structure with its own rule");
  } finally {
    await context.close();
  }
});

test("worked map notebooks remain readable and keyboard-scrollable on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [path, name] of [
    ["/structures/lww-map/", "LWWMap notebook lines before gate notes are shared"],
    ["/structures/or-map/", "OR-map notebooks at three checkpoints"],
  ]) {
    await page.goto(path);
    const figure = page.getByRole("table", { name }).locator("..");
    await expect(figure).toContainText("Scroll sideways to read every notebook.");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
    expect(await figure.evaluate((element) => element.scrollWidth - element.clientWidth))
      .toBeGreaterThan(0);
    await figure.focus();
    await page.keyboard.press("ArrowRight");
    await expect.poll(() => figure.evaluate((element) => element.scrollLeft)).toBeGreaterThan(0);
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
  await expect(demo.locator("[data-evidence]")).toHaveText("No operations shared yet.");
});
