import { expect, test } from "@playwright/test";

test("Sluice delivers the G-counter race and safely resends a component", async ({ page }) => {
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  const play = demo.getByRole("button", { name: "Play the race" });
  const resend = demo.locator('[data-action="resend"]');

  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(play).toBeEnabled();
  await expect(resend).toBeDisabled();
  const pace = demo.getByRole("slider", { name: "Speed" });
  await pace.fill("2");
  await expect(demo.locator("[data-pace-output]")).toHaveText("2×");
  await play.focus();
  await play.press("Enter");
  await expect(demo.locator(".operation-pulse").first()).toBeVisible();
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(resend).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Sluice delivered 2 operations. All three clients read 10.",
  );
  await expect(demo.getByRole("list", { name: "Latest Sluice deliveries" }).getByRole("listitem"))
    .toHaveCount(6);

  await demo.getByText("Explain why a component resend is safe", { exact: true }).click();
  await expect(demo.getByRole("table", { name: "Per-client G-counter components" })
    .locator("tbody td")).toHaveText(["7", "7", "7", "3", "3", "3", "0", "0", "0"]);

  const resendB = demo.getByRole("button", { name: "Resend B's component" });
  await resendB.press("Space");
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(resendB).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Sluice resent B's component. All three clients still read 10.",
  );
  await expect(demo.getByRole("list", { name: "Latest Sluice deliveries" }).getByRole("listitem"))
    .toHaveCount(9);
  await resendB.click();
  await expect(totals).toHaveText(["10", "10", "10"]);

  const reset = demo.getByRole("button", { name: "Reset", exact: true });
  await reset.click();
  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(play).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Play the authored race to send concurrent increments through Sluice.",
  );
});

test("each client can increment through automatic delivery", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");

  await demo.getByRole("button", { name: "Add 3 at replica C" }).click();
  await expect(totals).toHaveText(["3", "3", "3"]);
  await demo.getByRole("button", { name: "Add 1 at replica A" }).click();
  await expect(totals).toHaveText(["4", "4", "4"]);
  await expect(demo.locator("[data-sequence]")).toHaveText("2");
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Sluice delivered 1 operation. All three clients read 4.",
  );
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
    await expect(
      page.getByRole("heading", { name: "Sluice sequences and relays changes" }),
    ).toBeVisible();
    await expect(page.getByText("puts them in one total order")).toBeVisible();
    await expect(page.getByText("A client is an application connected")).toBeVisible();
    await expect(page.getByText("Sluice is not a data structure")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Start with one person counting" }))
      .toBeVisible();
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
    await expect(page.getByRole("button", { name: "Play the race" })).toBeDisabled();
    await expect(page.getByRole("slider", { name: "Speed" })).toBeDisabled();
    const explanation = page.getByText("Explain why a component resend is safe", { exact: true });
    await explanation.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("table", { name: "Per-client G-counter components" })).toBeVisible();
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
    if (width < 768) expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
    else expect(b.y).toBe(a.y);
  }
  expect(await demo.evaluate((element) => [element, ...element.querySelectorAll("*")].every((node) => {
    const style = getComputedStyle(node);
    return style.animationName === "none" && style.transitionDuration === "0s";
  }))).toBe(true);
});
