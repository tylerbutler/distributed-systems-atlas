import { expect, test } from "@playwright/test";

test("the sequencer delivers the G-counter race and safely resends a user's count", async ({ page }) => {
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  const race = demo.getByRole("button", { name: "Run A +7 and B +3 race" });
  const resend = demo.locator('[data-action="resend"]');

  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(race).toBeEnabled();
  await expect(resend).toBeDisabled();
  const pace = demo.getByRole("slider", { name: "Speed" });
  await pace.fill("2");
  await expect(demo.locator("[data-pace-output]")).toHaveText("2×");
  const guided = demo.getByRole("checkbox", { name: "Guided observations" });
  await guided.check();
  await expect(demo.getByRole("heading", { name: "Inside the sequencer" })).toBeVisible();
  await expect(demo.getByText("Sluice is the in-memory server behind this demo")).toBeVisible();
  await race.focus();
  await race.press("Enter");
  await expect(demo.locator(".operation-pulse").first()).toBeVisible();
  await expect(demo.getByRole("region", { name: "Sequencer" })).toHaveClass(/guided-box/);
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(totals.first()).toHaveClass(/guided-circle/);
  await expect(resend).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "The sequencer delivered the final operation. All three clients read 10.",
  );
  const log = demo.getByRole("list", { name: "Operation log" });
  await expect(log.getByRole("listitem")).toHaveCount(2);
  await expect(log).toContainText("SN 1 · A report to A, B, C");

  await demo.getByText("Explain why resending a user's count is safe", { exact: true }).click();
  await expect(demo.getByRole("table", { name: "Reported counts by user" })
    .locator("tbody td")).toHaveText(["7", "7", "7", "3", "3", "3", "0", "0", "0"]);

  const resendB = demo.getByRole("button", { name: "Resend B's count" });
  await resendB.press("Space");
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(resendB).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "The sequencer resent B's count. All three clients still read 10.",
  );
  await expect(log.getByRole("listitem")).toHaveCount(3);
  await resendB.click();
  await expect(totals).toHaveText(["10", "10", "10"]);

  const reset = demo.getByRole("button", { name: "Reset", exact: true });
  await reset.click();
  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(race).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Increment a client, or run the authored race through the sequencer.",
  );
});

test("multiple client operations can queue before sequencer delivery", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  const autoDeliver = demo.getByRole("checkbox", { name: "Auto-deliver" });

  await expect(autoDeliver).toBeChecked();
  await autoDeliver.uncheck();
  await demo.getByRole("button", { name: "Add 1 at replica A" }).click();
  await demo.getByRole("button", { name: "Add 3 at replica A" }).click();
  await demo.getByRole("button", { name: "Add 3 at replica B" }).click();
  await demo.getByRole("button", { name: "Add 7 at replica B" }).click();
  await demo.getByRole("button", { name: "Add 1 at replica C" }).click();
  await demo.getByRole("button", { name: "Add 7 at replica C" }).click();
  await expect(totals).toHaveText(["4", "10", "8"]);
  await expect(demo.locator('[role="status"]')).toContainText("6 operations are waiting");
  await autoDeliver.check();
  await expect(totals).toHaveText(["22", "22", "22"]);
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 6");
  await expect(demo.getByRole("list", { name: "Operation log" }).getByRole("listitem"))
    .toHaveCount(6);
  await expect(demo.locator('[role="status"]')).toHaveText(
    "The sequencer delivered the final operation. All three clients read 22.",
  );
});

test("auto-deliver keeps replica controls active while operations queue", async ({ page }) => {
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  await demo.getByRole("slider", { name: "Speed" }).fill("0.5");

  await demo.getByRole("button", { name: "Add 1 at replica A" }).click();
  await expect(demo.getByRole("button", { name: "Add 3 at replica A" })).toBeEnabled();
  await demo.getByRole("button", { name: "Add 3 at replica A" }).click();
  await demo.getByRole("button", { name: "Add 3 at replica B" }).click();
  await demo.getByRole("button", { name: "Add 7 at replica B" }).click();
  await demo.getByRole("button", { name: "Add 1 at replica C" }).click();
  await demo.getByRole("button", { name: "Add 7 at replica C" }).click();

  await expect(totals).toHaveText(["22", "22", "22"], { timeout: 15_000 });
  await expect(demo.getByRole("list", { name: "Operation log" }).getByRole("listitem"))
    .toHaveCount(6, { timeout: 15_000 });
});

test("operations travel to the sequencer immediately and broadcast waves overlap", async ({ page }) => {
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  await expect(demo.getByLabel("Operation states")).toContainText(
    "Unsequenced Client report traveling in",
  );
  await expect(demo.getByLabel("Operation states")).toContainText(
    "Sequenced Numbered broadcast traveling out",
  );
  await demo.getByRole("slider", { name: "Speed" }).fill("0.5");

  await demo.getByRole("button", { name: "Add 1 at replica A" }).click();
  await demo.getByRole("button", { name: "Add 3 at replica B" }).click();

  await expect(demo.locator('[data-leg="outbound"]')).toHaveCount(2);
  await expect(demo.locator('[data-leg="outbound"]').first()).toContainText(
    "A +1 · 1000 ms",
  );
  await expect(demo.locator('[data-leg="sequenced"]')).toHaveCount(6);
  await expect(demo.locator('[data-leg="sequenced"]').first()).toContainText("SN 1 · 1000 ms");
  expect(await demo.locator(".operation-pulse").first().evaluate(
    (element) => getComputedStyle(element).borderRadius,
  )).toBe("50%");
  await expect(demo.locator("[data-total]")).toHaveText(["1", "3", "0"]);
  await expect(demo.locator("[data-total]")).toHaveText(["4", "4", "4"]);
});

test("Counters remains useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/structures/counters/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Counters");
    await expect(page.getByRole("heading", { name: "Start with one person counting" }))
      .toBeVisible();
    await expect(page.getByText("Its local copy of the counter is a replica")).toBeVisible();
    await expect(page.getByRole("heading", {
      name: "Give the second person a separate count",
    })).toBeVisible();
    await expect(page.getByText("It does not add every message")).toBeVisible();
    await expect(page.getByLabel("G-counter merge and value rules")).toContainText(
      "count[A] = max(all reports from A)",
    );
    await expect(page.getByTestId("g-counter-demo").locator("[data-total]")).toHaveText(["0", "0", "0"]);
    await expect(page.getByText("After delivery, all three replicas read 10.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add 1 at replica A" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Run A +7 and B +3 race" })).toBeDisabled();
    await expect(page.getByRole("slider", { name: "Speed" })).toBeDisabled();
    await expect(page.getByRole("slider", { name: "Speed" })).toHaveAttribute("min", "0.25");
    await expect(page.getByRole("checkbox", { name: "Auto-deliver" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Auto-deliver" })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Guided observations" })).toBeDisabled();
    await expect(page.locator("[data-guided-panel]")).toBeHidden();
    const explanation = page.getByText("Explain why resending a user's count is safe", { exact: true });
    await explanation.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("table", { name: "Reported counts by user" })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("G-counter controls meet the keyboard and responsive layout contract", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBe(0);
    for (const control of await demo.locator("button, summary").all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const replicas = demo.getByRole("region", { name: /^Replica [AB]$/ });
    const a = (await replicas.nth(0).boundingBox())!;
    const b = (await replicas.nth(1).boundingBox())!;
    const c = (await demo.getByRole("region", { name: "Replica C" }).boundingBox())!;
    const sequencer = (await demo.getByRole("region", { name: "Sequencer" }).boundingBox())!;
    if (width < 768) {
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
      expect(c.y).toBeGreaterThanOrEqual(b.y + b.height);
      expect(sequencer.y).toBeGreaterThan(a.y + a.height);
      expect(b.y).toBeGreaterThan(sequencer.y + sequencer.height);
    } else {
      expect(b.y).toBe(a.y);
      expect(c.y).toBeGreaterThanOrEqual(a.y + a.height);
      expect(c.x).toBeGreaterThan(a.x);
      expect(c.x).toBeLessThan(b.x);
      expect(sequencer.x - (a.x + a.width)).toBeGreaterThan(20);
      expect(b.x - (sequencer.x + sequencer.width)).toBeGreaterThan(20);
    }
  }
  expect(await demo.evaluate((element) => [element, ...element.querySelectorAll("*")].every((node) => {
    const style = getComputedStyle(node);
    return style.animationName === "none" && style.transitionDuration === "0s";
  }))).toBe(true);
});
