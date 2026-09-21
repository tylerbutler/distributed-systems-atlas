import { expect, test } from "@playwright/test";

test("Sluice delivers the G-counter race and safely resends a component", async ({ page }) => {
  await page.goto("/structures/counters/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  const stage = demo.getByRole("button", { name: "Stage race: A +7, B +3" });
  const deliver = demo.getByRole("button", { name: "Deliver through Sluice" });
  const resend = demo.getByRole("button", { name: "Resend B's component" });

  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(stage).toBeEnabled();
  await expect(deliver).toBeDisabled();
  await expect(resend).toBeDisabled();
  await stage.focus();
  await stage.press("Enter");
  await expect(totals).toHaveText(["7", "3", "0"]);
  await expect(deliver).toBeFocused();
  await expect(demo.getByRole("region", { name: "Sluice transport" })).toContainText(
    "Queued framesYes",
  );

  await deliver.press("Enter");
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(resend).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Sluice delivered both operations. All three replicas read 10.",
  );
  await expect(demo.getByRole("list", { name: "Latest Sluice deliveries" }).getByRole("listitem"))
    .toHaveCount(6);

  await demo.getByText("Explain why resending the component is safe", { exact: true }).click();
  await expect(demo.getByRole("table", { name: "Per-client G-counter components" })
    .locator("tbody td")).toHaveText(["7", "7", "7", "3", "3", "3", "0", "0", "0"]);

  await resend.press("Space");
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(resend).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Sluice resent B's component. All three replicas still read 10.",
  );
  await expect(demo.getByRole("list", { name: "Latest Sluice deliveries" }).getByRole("listitem"))
    .toHaveCount(3);
  await resend.click();
  await expect(totals).toHaveText(["10", "10", "10"]);

  const reset = demo.getByRole("button", { name: "Reset", exact: true });
  await reset.click();
  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(stage).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText("All three replicas start at 0.");
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
    await expect(page.getByTestId("g-counter-demo").locator("[data-total]")).toHaveText(["0", "0", "0"]);
    await expect(page.getByText("After delivery, all three replicas read 10.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Stage race/ })).toBeDisabled();
    const explanation = page.getByText("Explain why resending the component is safe", { exact: true });
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
