import { expect, test } from "@playwright/test";
import { firstTrail } from "../src/lib/atlas/trail";

const warningText = "Not yet reviewed for correctness";
const referenceRoutes = [
  "/atlas/",
  "/glossary/",
  "/bibliography/",
  "/atlas/multiplayer-rooms/",
  ...firstTrail.map(({ id }) => `/atlas/${id}/`),
];

for (const width of [390, 1440]) {
  test(`reference warnings are prominent without JavaScript at ${width}px`, async ({ browser }) => {
    test.setTimeout(90_000);
    const context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width, height: 1000 },
    });
    try {
      const page = await context.newPage();
      for (const route of referenceRoutes) {
        await page.goto(route);
        const warning = page.locator("main > header, .sheet-header")
          .getByRole("complementary", { name: "Correctness review warning" });
        await expect(warning).toHaveText(warningText);
        await expect(warning).toBeInViewport();
        await expect(warning).toHaveCSS("border-top-width", "1px");
        const heading = (await page.getByRole("heading", { level: 1 }).boundingBox())!;
        const notice = (await warning.boundingBox())!;
        expect(notice.y).toBeGreaterThanOrEqual(heading.y + heading.height);
        expect(await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        ), route).toBe(0);
        if (await page.getByTestId("causal-lab").count()) {
          await expect(page.locator(".lab-complexity")
            .getByRole("complementary", { name: "Correctness review warning" }))
            .toHaveText(warningText);
        }
      }
      await page.goto("/structures/g-counter/");
      await expect(page.getByRole("complementary", { name: "Correctness review warning" }))
        .toHaveCount(0);
    } finally {
      await context.close();
    }
  });
}

test("each reference lab retains its warning after initialization and reset", async ({ page }) => {
  test.setTimeout(90_000);
  for (const { id } of firstTrail) {
    await page.goto(`/atlas/${id}/`);
    const lab = page.getByTestId("causal-lab");
    const reset = lab.getByRole("button", { name: "Reset lab", exact: true });
    await expect(reset).toBeVisible();
    const warning = page.locator(".lab-complexity")
      .getByRole("complementary", { name: "Correctness review warning" });
    await warning.scrollIntoViewIfNeeded();
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText(warningText);
    await reset.click();
    await expect(warning).toBeVisible();
    await expect(warning).toHaveText(warningText);
  }
});
