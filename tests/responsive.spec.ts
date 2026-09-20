import { expect, test } from "@playwright/test";

for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
  test(`landing page works as a station field at ${viewport.width} × ${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    await page.evaluate(() => document.fonts.ready);

    const figure = page.getByRole("figure");
    const headline = page.getByRole("heading", { level: 1 });
    const stationA = figure.getByText("Station A records A:1", { exact: true });
    const stationB = figure.getByText("Station B records B:1", { exact: true });
    const relation = figure.locator("figcaption");
    const primary = page.getByRole("link", { name: "Begin with dots and causal context", exact: true });
    const secondary = page.getByRole("link", { name: "Open the atlas", exact: true });
    const sectionTwo = page.getByRole("region", { name: "What the atlas lets you inspect", exact: true });
    await expect(figure).toBeVisible();
    await expect(relation).toHaveText("Concurrent — neither station has observed the other event");

    const sectionBox = await sectionTwo.boundingBox();
    expect(sectionBox).not.toBeNull();
    for (const element of [headline, stationA, stationB, relation, primary, secondary]) {
      await expect(element).toBeVisible();
      const box = await element.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(sectionBox!.y);
      await expect(element).toBeInViewport({ ratio: 1 });
    }
    const a = await stationA.boundingBox();
    const b = await stationB.boundingBox();
    expect(b!.y).toBeGreaterThan(a!.y + a!.height);
    if (viewport.width === 390) {
      expect(b!.x).toBe(a!.x);
      const path = await figure.locator(".signal-path").boundingBox();
      expect(path!.y).toBeGreaterThanOrEqual(a!.y + a!.height);
      expect(path!.y + path!.height).toBeLessThanOrEqual(b!.y);
    } else {
      expect(b!.x).toBeGreaterThan(a!.x + a!.width);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(viewport.width);
    expect(await figure.evaluate((element) => element.getAnimations({ subtree: true }).length)).toBe(0);
    for (const element of [stationA, stationB, relation]) {
      await expect(element).toHaveCSS("opacity", "1");
    }
    for (const link of [primary, secondary]) {
      const box = await link.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
    }
  });
}

test("the landing relation appears after both observations in normal motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");

  const relation = page.getByRole("figure").locator("figcaption");
  const opacityAt = (time: number) => relation.evaluate((element, currentTime) => {
    const animation = element.getAnimations().find(
      (candidate) => (candidate as CSSAnimation).animationName === "relation-arrives",
    );
    if (!animation) throw new Error("Relation animation not found");
    animation.pause();
    animation.currentTime = currentTime;
    return getComputedStyle(element).opacity;
  }, time);

  expect(await opacityAt(499)).toBe("0");
  expect(await opacityAt(720)).toBe("1");
});

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
