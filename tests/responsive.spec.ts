import { expect, test } from "@playwright/test";

test("the observation rail wraps without horizontal overflow", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  for (const width of [320, 390, 767, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const rail = page.getByRole("navigation", { name: "Sheet position", exact: true });
    await expect(rail).toBeVisible();
    await expect(page.locator("body")).toHaveJSProperty(
      "scrollWidth",
      await page.locator("body").evaluate((body) => body.clientWidth),
    );
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    for (const item of await rail.getByRole("listitem").all()) {
      await expect(item).toBeVisible();
    }
    const trace = rail.locator(".observation-trace");
    await expect(trace).toBeVisible();
    await expect(trace).toHaveAttribute("aria-hidden", "true");
    if (width < 768) {
      const textBox = await rail.getByRole("list").boundingBox();
      const traceBox = await trace.boundingBox();
      expect(textBox).not.toBeNull();
      expect(traceBox).not.toBeNull();
      expect(traceBox!.y).toBeGreaterThanOrEqual(textBox!.y + textBox!.height);
    }
  }
});

test("working and planned navigation stays visible in a broad publication band", async ({ page }) => {
  await page.goto("/");
  for (const width of [320, 390, 767, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const header = page.getByRole("banner");
    const box = await header.boundingBox();
    expect(box?.x).toBe(0);
    expect(box?.width).toBe(width);
    await expect(header).toHaveCSS("border-radius", "0px");
    await expect(header).toHaveCSS("background-color", "oklch(0.29 0.075 238)");
    const nav = header.getByRole("navigation", { name: "Primary", exact: true });
    const atlas = nav.getByRole("link", { name: "Atlas", exact: true });
    await expect(atlas).toBeInViewport();
    await expect(nav.getByRole("button")).toHaveCount(0);
    for (const label of ["Trails", "Glossary", "References"]) {
      await expect(nav.getByText(label, { exact: true })).toBeInViewport();
    }
    if (width < 768) {
      const rows = await nav.getByRole("listitem").evaluateAll((items) =>
        items.map((item) => item.getBoundingClientRect().top),
      );
      expect(rows[0]).toBe(rows[1]);
      expect(rows[2]).toBe(rows[3]);
      expect(rows[2]).toBeGreaterThan(rows[0]);
    }
    await atlas.focus();
    await expect(atlas).toHaveCSS("outline-style", "solid");
    await expect(atlas).toHaveCSS("outline-width", "3px");
    await expect(atlas).toHaveCSS("outline-color", "oklch(0.84 0.18 100)");
  }
});
