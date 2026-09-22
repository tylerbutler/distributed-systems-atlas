import { expect, test } from "@playwright/test";

const lessons = [
  "counters",
  "g-counter",
  "pn-counter",
  "shared-counter",
  "sets",
  "g-set",
  "two-p-set",
  "observed-remove-set",
];

for (const width of [1440, 390]) {
  test.describe(`lesson illustrations at ${width}px`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width, height: 900 } });

    test("each lesson loads its accessible artwork without JavaScript", async ({ page }) => {
      for (const slug of lessons) {
        await test.step(slug, async () => {
          await page.goto(`/structures/${slug}/`);
          const image = page.locator(".page-intro img");
          await expect(image).toHaveCount(1);
          await expect(image).toBeVisible();
          await expect(image).toHaveAttribute(
            "src",
            `/illustrations/lessons/structures-${slug}.svg`,
          );
          expect((await image.getAttribute("alt"))?.trim().length).toBeGreaterThan(20);
          await expect(image).toHaveAttribute("width", "900");
          await expect(image).toHaveAttribute("height", "600");
          await expect(image).toHaveJSProperty("naturalWidth", 900);
          await expect(image).toHaveJSProperty("naturalHeight", 600);

          if (slug === "counters" || slug === "sets") {
            await expect(page.locator(".page-intro > p").last()).toHaveCSS(
              "font-size",
              "19.2px",
            );
          }

          const bounds = await image.boundingBox();
          if (!bounds) throw new Error(`Missing illustration bounds for ${slug}`);
          expect(bounds.x).toBeGreaterThanOrEqual(0);
          expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
          expect(bounds.height / bounds.width).toBeCloseTo(2 / 3, 2);

          if (["g-counter", "pn-counter", "shared-counter"].includes(slug)) {
            await expect(page.locator(".counter-illustration svg")).toBeVisible();
          }
        });
      }
    });
  });
}
