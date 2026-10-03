import { expect, test } from "@playwright/test";

test("the signed race receives sequence numbers and converges", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-counter/");
  const demo = page.getByTestId("shared-counter-demo");
  const totals = demo.locator("[data-shared-total]");
  const race = demo.getByRole("button", {
    name: "Race Alice +3 and Bob -1",
  });

  await expect(totals).toHaveText(["10", "10", "10"]);
  await race.click();
  await expect(totals).toHaveText(["12", "12", "12"]);
  await expect(race).toBeFocused();
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 2");
  await expect(demo.getByRole("list", { name: "Sequenced operation log" })
    .getByRole("listitem")).toHaveText([
    "SN 2 · Bob -1",
    "SN 1 · Alice +3",
  ]);
  await expect(demo.locator('[role="status"]')).toHaveText(
    "The ranger broadcast the final numbered change. All three hikers read 12.",
  );
});

test("replica controls stay active while numbered operations travel", async ({ page }) => {
  await page.goto("/structures/shared-counter/");
  const demo = page.getByTestId("shared-counter-demo");
  const alice = demo.getByRole("button", { name: "Send +1 for Alice" });
  const bob = demo.getByRole("button", { name: "Send -1 for Bob" });
  const carol = demo.getByRole("button", { name: "Send +3 for Carol" });

  await alice.click();
  await expect(demo.locator('[data-leg="outbound"]')).toContainText(
    "Alice +1 · 1000 ms",
  );
  await expect(demo.locator('[data-leg="sequenced"]').first()).toBeVisible();
  await expect(demo.locator("[data-shared-total]")).toHaveText(["11", "10", "10"]);
  await expect(bob).toBeEnabled();
  await bob.click();
  await expect(carol).toBeEnabled();
  await carol.click();

  await expect(demo.locator("[data-shared-total]")).toHaveText(["13", "13", "13"], {
    timeout: 12_000,
  });
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 3");
  await expect(demo.getByRole("list", { name: "Sequenced operation log" })
    .getByRole("listitem")).toHaveCount(3);
});

test("reset creates a fresh sequenced room", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-counter/");
  const demo = page.getByTestId("shared-counter-demo");
  await demo.getByRole("button", { name: "Send -3 for Carol" }).click();
  await expect(demo.locator("[data-shared-total]")).toHaveText(["7", "7", "7"]);
  await demo.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(demo.locator("[data-shared-total]")).toHaveText(["10", "10", "10"]);
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 0");
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Send a signed change, or race Alice's count against Bob's correction.",
  );
});

test("SharedCounter content remains useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/structures/shared-counter/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("SharedCounter");
    const facts = page.getByRole("complementary", { name: "Quick facts" });
    await expect(facts).toContainText("DDS");
    await expect(facts).toContainText("Signed integer deltas");
    await expect(page.getByRole("figure", {
      name: "A ranger numbers signed bird-count changes before broadcasting them",
    })).toBeVisible();
    await expect(page.getByRole("heading", {
      name: "The ranger opens a numbered log",
    })).toBeVisible();
    await expect(page.getByLabel("Ranger's numbered SharedCounter ledger")
      .locator("tbody tr")).toHaveText([
      "SN 1Alice+3",
      "SN 2Bob-1",
    ]);
    const rangerStory = page.locator('section[aria-labelledby="ranger-log-title"]');
    await expect(rangerStory).toContainText(
      "Carol misses SN 1, but then receives SN 2",
    );
    await expect(rangerStory).toContainText(
      "asks the ranger to resend the missing ledger line",
    );
    await expect(page.getByLabel("Bird count as SharedCounter operations are sequenced")
      .locator("tbody tr")).toHaveText([
      "Agreed count101010",
      "Notes in transit13910",
      "SN 1 and SN 2 applied121212",
    ]);
    await expect(page.getByRole("region", { name: "One number means one application" }))
      .toContainText("ignore a number that has already been applied");
    const demo = page.getByTestId("shared-counter-demo");
    await expect(demo.locator("[data-shared-total]")).toHaveText(["10", "10", "10"]);
    await expect(demo.getByRole("button", {
      name: "Race Alice +3 and Bob -1",
    })).toBeDisabled();
  } finally {
    await context.close();
  }
});

test("the counter family links all three counter lessons", async ({ page }) => {
  await page.goto("/structures/counters/");
  await expect(page.getByRole("link", { name: "Read the G-counter lesson" }))
    .toHaveAttribute("href", "/structures/g-counter/");
  await expect(page.getByRole("link", { name: "Read the PN-counter lesson" }))
    .toHaveAttribute("href", "/structures/pn-counter/");
  await expect(page.getByRole("link", { name: "Read the SharedCounter lesson" }))
    .toHaveAttribute("href", "/structures/shared-counter/");
  await expect(page.getByRole("heading", { name: "SharedCounter", exact: true }))
    .toBeVisible();
});

test("SharedCounter controls remain keyboard sized without overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-counter/");
  const demo = page.getByTestId("shared-counter-demo");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBe(0);
    for (const control of await demo.locator("button, summary").all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await demo.evaluate((element) => [element, ...element.querySelectorAll("*")].every((node) => {
    const style = getComputedStyle(node);
    return style.animationName === "none" && style.transitionDuration === "0s";
  }))).toBe(true);
});
