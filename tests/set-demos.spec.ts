import { expect, test } from "@playwright/test";

for (const example of [
  {
    path: "/structures/g-set/",
    testId: "g-set-demo",
    race: "Race Alice and Bob's reports",
    values: [["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"], ["Eagle Creek", "Ridge Pass"]],
    evidence: "Entries only accumulate",
  },
  {
    path: "/structures/two-p-set/",
    testId: "two-p-set-demo",
    race: "Race Alice's retirement and Bob's report",
    values: [[], [], []],
    evidence: "permanent removal tombstone",
  },
  {
    path: "/structures/observed-remove-set/",
    testId: "or-set-demo",
    race: "Race removal against replacement",
    values: [["Eagle Creek"], ["Eagle Creek"], ["Eagle Creek"]],
    evidence: "A:1 is removed. B:2 is live.",
  },
]) {
  test(`${example.testId} runs its three-client authored race`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(example.path);
    const demo = page.getByTestId(example.testId);
    const race = demo.getByRole("button", { name: example.race });

    await expect(demo.locator("[data-client]")).toHaveCount(3);
    await race.click();
    for (const [index, values] of example.values.entries()) {
      const members = demo.locator("[data-member-list]").nth(index).locator("span");
      await expect(members).toHaveText(values);
    }
    if (example.testId === "g-set-demo") {
      const firstMembers = demo.locator("[data-member-list]").first().locator("span");
      expect(await firstMembers.first().evaluate((element) =>
        getComputedStyle(element, "::after").content
      )).toBe('","');
      expect(await firstMembers.last().evaluate((element) =>
        getComputedStyle(element, "::after").content
      )).toBe("none");
      await expect(demo.locator('[role="status"]')).toContainText(
        "Eagle Creek, Ridge Pass",
      );
    }
    await expect(demo.locator("[data-evidence]")).toContainText(example.evidence);
    await expect(race).toBeFocused();
  });
}

test("replica controls stay active while set records travel", async ({ page }) => {
  await page.goto("/structures/g-set/");
  const demo = page.getByTestId("g-set-demo");
  const alice = demo.getByRole("button", { name: "Report Eagle Creek" });
  const bob = demo.getByRole("button", { name: "Report Ridge Pass" });

  await alice.click();
  await expect(demo.locator(".set-operation-pulse")).toContainText("+ Eagle Creek");
  await expect(bob).toBeEnabled();
  await bob.click();
  await expect(demo.locator("[data-member-list] span")).toHaveCount(6, {
    timeout: 10_000,
  });
});

test("set notebooks update after the shared record arrives", async ({ page }) => {
  await page.goto("/structures/g-set/");
  const demo = page.getByTestId("g-set-demo");

  await demo.getByRole("button", { name: "Report Eagle Creek" }).click();
  await expect(demo.locator(".set-operation-pulse.shared").first()).toBeVisible();
  await expect(demo.locator("[data-member-list]").nth(0).locator("span"))
    .toHaveText(["Eagle Creek"]);
  await expect(demo.locator("[data-member-list]").nth(1).locator("span")).toHaveCount(0);
  await expect(demo.locator("[data-member-list]").nth(2).locator("span")).toHaveCount(0);

  await expect(demo.locator("[data-member-list] span")).toHaveCount(3, {
    timeout: 10_000,
  });
});

test("set lessons retain useful no-JavaScript states", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const [path, heading, testId, notebookTable] of [
      ["/structures/g-set/", "GSet", "g-set-demo", "Eagle Creek GSet delivery"],
      ["/structures/two-p-set/", "TwoPSet", "two-p-set-demo", "TwoPSet notebooks before records meet"],
      ["/structures/observed-remove-set/", "Observed-remove set", "or-set-demo", "Observed-remove notebooks before records meet"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      await expect(page.getByRole("table", { name: notebookTable })).toBeVisible();
      const demo = page.getByTestId(testId);
      await expect(demo.locator("[data-client]")).toHaveCount(3);
      await expect(demo.getByText("Visible beacon list")).toHaveCount(3);
      await expect(demo.getByRole("region", { name: "Trail message relay" }))
        .toContainText("No ordering decision");
      await expect(demo.getByRole("button").first()).toBeDisabled();
      await expect(demo).toContainText("Enable JavaScript to run the demo");
      if (testId === "two-p-set-demo") {
        await expect(page.getByRole("heading", { name: "Add a second GSet" }))
          .toBeVisible();
        await expect(page.getByLabel("TwoPSet definition")).toContainText(
          "composed of two GSets",
        );
        await expect(page.getByLabel("TwoPSet composition and membership rule"))
          .toContainText("TwoPSet = additions GSet + removals GSet");
      }
    }
  } finally {
    await context.close();
  }
});

test("reset restores the observed-remove set baseline", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/observed-remove-set/");
  const demo = page.getByTestId("or-set-demo");
  await demo.getByRole("button", { name: "Race removal against replacement" }).click();
  await demo.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(demo.locator("[data-member-list] span")).toHaveText([
    "Eagle Creek",
    "Eagle Creek",
    "Eagle Creek",
  ]);
  await expect(demo.locator("[data-evidence]")).toHaveText(
    "A:1 is the live old installation.",
  );
});
