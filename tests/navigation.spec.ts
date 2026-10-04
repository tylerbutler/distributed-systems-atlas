import { expect, test } from "@playwright/test";
import { structureGroups } from "../src/lib/structure-demo/structure-navigation";
import { firstTrail } from "../src/lib/atlas/trail";

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

test("opening and continuation contents have distinct accessible names", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const { id } of firstTrail) {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`/atlas/${id}/`);
      const opening = page.getByRole("navigation", { name: "On this sheet", exact: true });
      const continuation = page.getByRole("navigation", { name: "Continue reading", exact: true });
      await expect(opening).toHaveCount(1);
      await expect(continuation).toHaveCount(1);
      expect(await continuation.getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      )).toEqual(await opening.getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href")),
      ));
      await continuation.getByRole("link", { name: "Field notes", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { name: "Field notes", exact: true })).toBeInViewport();
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(continuation).toHaveCount(0);
      const summary = page.locator(".sheet-local-opening summary");
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(opening).toHaveCount(1);
    }
    await page.goto("/atlas/multiplayer-rooms/");
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(page.getByRole("navigation", { name: "In this note", exact: true })).toHaveCount(1);
    await expect(page.getByRole("navigation", { name: "Continue reading", exact: true })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("secondary navigation retains 44px targets and works by touch", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, hasTouch: true });
  try {
    const page = await context.newPage();
    for (const width of [320, 390, 820, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of ["/structures/", "/atlas/multiplayer-rooms/"]) {
        await page.goto(route);
        await page.evaluate(() => document.fonts.ready);
        const targets = await page.locator(".site-name, .footer-navigation h3 a, .structure-guide a")
          .evaluateAll((links) => links.map((link) => {
            const { width, height } = link.getBoundingClientRect();
            return { text: link.textContent, width, height };
          }));
        for (const target of targets) {
          expect(target.height, `${route}: ${target.text}`).toBeGreaterThanOrEqual(44);
          expect(target.width, `${route}: ${target.text}`).toBeGreaterThanOrEqual(44);
        }
        expect(await page.evaluate(() =>
          document.documentElement.scrollWidth - document.documentElement.clientWidth,
        )).toBe(0);
      }
      await page.locator(".footer-navigation h3 a").filter({ hasText: "Counters" }).tap();
      await expect(page.getByRole("heading", { level: 1 })).toHaveText("Counters");
      await page.locator(".site-name").tap();
      await expect(page).toHaveURL("http://127.0.0.1:4321/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    }
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
