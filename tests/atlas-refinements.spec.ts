import { expect, test } from "@playwright/test";

for (const width of [320, 390, 768, 1440]) {
  test(`counter evidence and live-lab links remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    for (const [slug, action, resultClass] of [
      ["g-counter", "Leave Alice +7 and Bob +3 together", ".gcounter-result"],
      ["pn-counter", "Run Alice +3 and Bob -1 correction", ".pn-result"],
      ["shared-counter", "Race Alice +3 and Bob -1", ".shared-result"],
    ]) {
      await page.goto(`/structures/${slug}/`);
      const demo = page.locator(".structure-demo-root");
      const race = demo.getByRole("button", { name: action, exact: true });
      await expect(race).toBeEnabled();
      await race.click();
      const log = demo.locator(".operation-log li").first();
      await expect(log).toHaveCSS("font-size", "16px");
      await expect(log).toHaveCSS("line-height", "24px");
      const result = demo.locator(resultClass);
      const measure = await result.evaluate((element) => {
        const style = getComputedStyle(element);
        return { width: element.getBoundingClientRect().width, max: Number.parseFloat(style.maxWidth) };
      });
      expect(measure.width).toBeLessThanOrEqual(measure.max);
      if (slug !== "pn-counter") {
        await expect(demo.locator("[data-room-code]")).toHaveCount(0);
        const lab = demo.getByRole("link", { name: "Try this across three tabs or devices" });
        await expect(lab).toHaveAttribute("href", `/labs/${slug}/`);
        await page.keyboard.press("Tab");
        await lab.focus();
        await expect(lab).toHaveCSS("outline-style", "solid");
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}

test("lesson openings expose local actions while retaining compact artwork", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto("/structures/g-counter/");
      const illustration = page.locator(".page-intro .lesson-illustration");
      await expect(illustration).toBeVisible();
      expect((await illustration.boundingBox())!.width).toBeLessThanOrEqual(192);
      await expect(page.getByRole("navigation", { name: "G-counter lesson map" })).toBeInViewport();
      if (width === 390) {
        const action = page.getByRole("link", { name: "Understand the notebooks", exact: true });
        await expect(action).toBeInViewport();
        expect((await action.boundingBox())!.y + (await action.boundingBox())!.height).toBeLessThanOrEqual(844);
        expect((await illustration.boundingBox())!.y).toBeGreaterThan((await action.boundingBox())!.y);
      }
      await page.goto("/structures/");
      await expect(page.locator(".structure-index")).toHaveJSProperty("tagName", "UL");
      await expect(page.getByText("Start here", { exact: true })).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});
