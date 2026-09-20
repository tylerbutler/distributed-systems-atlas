import { expect, test } from "@playwright/test";

test("the publication exposes its observatory foundation", async ({ page }) => {
  await page.goto("/");

  const tokens = await page.evaluate(() => ({
    sheet: getComputedStyle(document.documentElement)
      .getPropertyValue("--sky-sheet")
      .trim(),
    instrument: getComputedStyle(document.documentElement)
      .getPropertyValue("--instrument")
      .trim(),
  }));
  expect(tokens).toEqual(
    expect.objectContaining({
      sheet: "oklch(96% 0.025 225)",
      instrument: "oklch(29% 0.075 238)",
    }),
  );
  await expect(page.getByTestId("station-mark-a")).toBeVisible();
  await expect(page.getByTestId("station-mark-b")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("observatory foundation keeps labeled station geometry without JavaScript or motion", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const a = page.getByTestId("station-mark-a");
      const b = page.getByTestId("station-mark-b");
      await expect(a).toBeVisible();
      await expect(b).toBeVisible();
      await expect(a).toContainText("A");
      await expect(b).toContainText("B");
      await expect(a).toHaveAttribute("aria-hidden", "true");
      await expect(b).toHaveAttribute("aria-hidden", "true");
      await expect(a.locator("circle")).toBeVisible();
      await expect(b.locator("polygon")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect(page.locator("body")).toHaveCSS("font-family", /Roboto Serif Variable/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCSS("font-family", /Encode Sans Variable/);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveCSS("outline-color", "oklch(0.29 0.075 238)");
  } finally {
    await context.close();
  }
});

test("observatory foundation primitives provide field-aware focus and type roles", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").evaluate((main) => {
    const field = document.createElement("section");
    field.className = "instrument-panel";
    field.innerHTML = '<button>Inspect station</button><div class="chart-field"><button>Read record</button><span class="observation-label">Replica A</span><code>A:1</code></div><div class="signal-rule"></div>';
    main.append(field);
  });
  const panel = page.locator("main .instrument-panel");
  await expect(panel).toHaveCSS("background-color", "oklch(0.29 0.075 238)");
  const inspect = page.getByRole("button", { name: "Inspect station" });
  await inspect.focus();
  await expect(inspect).toHaveCSS("outline-color", "oklch(0.84 0.18 100)");
  await expect(inspect).toHaveCSS("font-family", /Encode Sans Variable/);
  const read = page.getByRole("button", { name: "Read record" });
  await page.keyboard.press("Tab");
  await expect(read).toBeFocused();
  await expect(read).toHaveCSS("outline-color", "oklch(0.29 0.075 238)");
  await expect(page.locator(".chart-field")).toHaveCSS("background-color", "oklch(0.96 0.025 225)");
  await expect(page.locator(".observation-label")).toHaveCSS("font-family", /Encode Sans Variable/);
  await expect(page.locator("code")).toHaveCSS("font-family", /Azeret Mono Variable/);
  await expect(page.locator(".signal-rule")).toHaveCSS("height", "2px");
});
