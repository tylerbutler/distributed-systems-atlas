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

test("atlas and sheets describe the same optional background", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/atlas/");
    const topic = page.getByTestId("territory-chart").getByRole("listitem")
      .filter({ has: page.getByRole("heading", { name: "Multi-value registers", exact: true }) });
    await expect(topic).toContainText("Helpful background: Vector clocks, Dots and causal context");
    await expect(topic).not.toContainText("Requires:");
    await topic.getByRole("link", { name: "Multi-value registers", exact: true }).click();
    const background = page.getByRole("navigation", { name: "Helpful background", exact: true });
    await expect(background.getByRole("link")).toHaveText(["Vector clocks", "Dots and causal context"]);
    await page.goto("/atlas/local-history/");
    await expect(page.locator(".sheet-header")).toContainText("No background sheet listed");
    await expect(page.getByRole("navigation", { name: "Helpful background", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("glossary letters group all terms and support keyboard jumps without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/glossary/");
    const terms = page.locator(".reference-list dt");
    const expectedLetters = [...new Set(
      (await terms.allTextContents()).map((term) => term.charAt(0).toUpperCase()),
    )];
    const index = page.getByRole("navigation", { name: "Glossary letters", exact: true });
    await expect(index.getByRole("link")).toHaveText(expectedLetters);
    for (const letter of expectedLetters) {
      const group = page.getByRole("region", { name: letter, exact: true });
      expect(await group.locator("dt").count()).toBeGreaterThan(0);
      expect((await group.locator("dt").allTextContents())
        .every((term) => term.charAt(0).toUpperCase() === letter)).toBe(true);
      await expect(index.getByRole("link", { name: letter, exact: true }))
        .toHaveAttribute("href", `#glossary-${letter.toLowerCase()}`);
    }
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await index.getByRole("link", { name: "V", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.locator("#glossary-v")).toBeFocused();
      await expect(page.locator("#glossary-v")).toBeInViewport();
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )).toBe(0);
    }
    await page.goto("/glossary/#vector-clock");
    await expect(page.locator("#vector-clock")).toBeInViewport();
    await expect(page.locator("#vector-clock")).toContainText("one counter per tracked process");
    await expect(page.locator("#replica")).toContainText("A local copy of shared data");
  } finally {
    await context.close();
  }
});
