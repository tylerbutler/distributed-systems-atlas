import { expect, test } from "@playwright/test";

test.use({ javaScriptEnabled: false });

for (const width of [390, 1440]) {
  test(`Systems distinguishes implementation notes without changing lessons at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/atlas/");
    const systems = page.getByTestId("territory-systems");
    await expect(systems).toHaveClass(/systems-surface/);
    await expect(systems.getByRole("heading", { level: 2 })).toHaveText("Systems");
    await expect(systems).toContainText("Inside the Atlas");
    await expect(systems).toContainText("Implementation notes on the Atlas");
    await expect(page.getByTestId("territory-mechanisms")).not.toHaveClass(/systems-surface/);
    const fieldColors = await page.evaluate(() => ({
      index: getComputedStyle(document.documentElement).backgroundColor,
      systems: getComputedStyle(document.querySelector("#systems")!).backgroundColor,
    }));
    expect(fieldColors.systems).not.toBe(fieldColors.index);

    const link = systems.getByRole("link", { name: "How multiplayer rooms work", exact: true });
    await link.focus();
    await expect(link).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/atlas\/multiplayer-rooms\/$/);
    await expect(page.locator("html")).toHaveAttribute("data-section", "systems");
    await expect(page.locator(".sheet")).toHaveClass(/systems-sheet/);
    await expect(page.locator(".sheet-header .systems-context")).toContainText("Inside the Atlas");
    await expect(page.locator(".sheet-header .systems-context").getByRole("link", { name: "Systems" }))
      .toHaveAttribute("href", "/atlas/#systems");
    await expect(page.locator(".sheet-opening > p").first())
      .toHaveCSS("font-family", /Encode Sans Variable/);
    await expect(page.getByRole("complementary", { name: "Correctness review warning" }))
      .toHaveCount(0);

    const contrast = await page.evaluate(() => {
      const context = document.createElement("canvas").getContext("2d");
      if (!context) throw new Error("Canvas is unavailable for color contrast checks.");
      const luminance = (color: string) => {
        context.fillStyle = color;
        context.fillRect(0, 0, 1, 1);
        const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
        const linear = (value: number) => {
          const channel = value / 255;
          return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      };
      const ratio = (foreground: string, background: string) => {
        const a = luminance(foreground);
        const b = luminance(background);
        return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      };
      const root = getComputedStyle(document.documentElement);
      const link = getComputedStyle(document.querySelector(".systems-context a")!);
      const label = getComputedStyle(document.querySelector(".systems-context span")!);
      const navigation = getComputedStyle(document.querySelector(".observation-rail")!);
      return {
        text: ratio(root.color, root.backgroundColor),
        link: ratio(link.color, root.backgroundColor),
        label: ratio(label.color, root.backgroundColor),
        navigation: ratio(navigation.color, navigation.backgroundColor),
      };
    });
    for (const ratio of Object.values(contrast)) expect(ratio).toBeGreaterThanOrEqual(4.5);

    const contents = page.getByRole("navigation", { name: "In this note", exact: true });
    if (width < 1152) {
      const summary = page.locator(".sheet-contents").first().locator("summary");
      await summary.focus();
      await page.keyboard.press("Enter");
      await expect(summary).toHaveCSS("outline-style", "solid");
    }
    await expect(contents).toBeVisible();
    const crdt = contents.getByRole("link", { name: /^CRDT path:/ });
    await crdt.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: /^CRDT path:/ })).toBeInViewport();

    await page.goto("/atlas/local-history/");
    await expect(page.locator("html")).not.toHaveAttribute("data-section", "systems");
    await expect(page.locator(".sheet")).not.toHaveClass(/systems-sheet/);
    await expect(page.locator(".sheet-header .systems-context")).toHaveCount(0);
    await expect(page.locator(".sheet-opening > p").first())
      .toHaveCSS("font-family", /Roboto Serif Variable/);
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).backgroundColor))
      .toBe(fieldColors.index);
  });
}

test("the multiplayer note keeps every definition visible on phones, tablets, and desktops", async ({ page }) => {
  await page.goto("/atlas/multiplayer-rooms/");
  const terms = [
    "CRDT", "DDS", "sequencer", "Durable Object", "WebSocket",
    "optimistic update", "state snapshot", "hibernation", "epoch",
  ];
  await expect(page.locator(".sheet-body .term-callout")).toHaveCount(terms.length);
  for (const width of [390, 1024, 1152, 1180, 1194, 1366, 1440]) {
    await page.setViewportSize({ width, height: 820 });
    for (const term of terms) {
      const definition = page.getByLabel(`${term} definition`, { exact: true });
      await expect(definition).toBeVisible();
      await definition.scrollIntoViewIfNeeded();
      await expect(definition).toBeInViewport();
    }
    expect(await page.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    ), `Definitions at ${width}px`).toBe(0);
  }
});

test("Systems and the reference index reflow at narrow and wide widths", async ({ page }) => {
  for (const route of ["/atlas/", "/atlas/multiplayer-rooms/"]) {
    await page.goto(route);
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      expect(await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
      ), `${route} at ${width}px`).toBe(0);
    }
  }
});
