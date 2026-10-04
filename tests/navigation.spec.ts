import { expect, test } from "@playwright/test";
import { structureGroups } from "../src/lib/structure-demo/structure-navigation";

test("lessons expose contextual reference sheets without JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const destinations = new Set<string>();
    for (const group of structureGroups) {
      for (const [, slug] of group.lessons) {
        await page.goto(`/structures/${slug}/`);
        const related = page.getByRole("navigation", { name: "Related reference sheets", exact: true });
        await expect(related).toBeVisible();
        const links = related.getByRole("link");
        const count = await links.count();
        expect(count).toBeGreaterThanOrEqual(1);
        expect(count).toBeLessThanOrEqual(3);
        await expect(related.locator(".sheet-link-summary")).toHaveCount(count);
        for (const href of await links.evaluateAll((items) => items.map((item) => item.getAttribute("href")))) {
          expect(href).toMatch(/^\/atlas\/[^/]+\/$/);
          if (href) destinations.add(href);
        }
        await expect(page.getByRole("navigation", { name: "Browse structures" }))
          .not.toContainText(/Start|Continue to|Back to/);
      }
    }
    for (const destination of destinations) {
      const response = await request.get(destination);
      expect(response.status()).toBe(200);
    }
    await page.goto("/structures/multi-value-register/");
    await expect(page.getByRole("navigation", { name: "Related reference sheets", exact: true })
      .getByRole("link", { name: "Multi-value registers", exact: true }))
      .toHaveAttribute("href", "/atlas/multi-value-registers/");
    await page.goto("/structures/counters/");
    await expect(page.getByRole("navigation", { name: "Related reference sheets", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});
