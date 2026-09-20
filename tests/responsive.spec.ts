import { expect, test } from "@playwright/test";

test("sheet reading context changes topology and the lab returns to measure", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  for (const width of [320, 390, 768, 1152, 1153, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    const title = await page.getByRole("heading", { level: 1 }).boundingBox();
    const opening = page.locator(".sheet-opening");
    const continuation = page.locator(".sheet-continuation");
    const prose = await opening.boundingBox();
    const after = await continuation.boundingBox();
    const lab = await page.getByTestId("causal-lab").boundingBox();
    expect(prose).not.toBeNull();
    expect(after).not.toBeNull();
    expect(lab).not.toBeNull();
    expect(title!.x).toBe(prose!.x);
    expect(after!.x).toBe(prose!.x);
    expect(after!.width).toBe(prose!.width);
    expect(lab!.y).toBeGreaterThanOrEqual(prose!.y + prose!.height);
    expect(after!.y).toBeGreaterThanOrEqual(lab!.y + lab!.height);
    expect(await opening.evaluate((element) => {
      const measure = document.createElement("div");
      measure.style.width = "68ch";
      element.append(measure);
      const limit = measure.getBoundingClientRect().width;
      measure.remove();
      return element.getBoundingClientRect().width <= limit + 1;
    })).toBe(true);
    const rail = page.locator(".sheet-local");
    const terms = page.getByRole("complementary", { name: "Terms on this sheet" });
    const contents = page.getByRole("navigation", { name: "On this sheet", exact: true });
    if (width > 1152) {
      await expect(contents).toBeVisible();
      await expect(terms).toBeVisible();
      await expect(page.locator(".sheet-contents > summary")).toBeHidden();
      const left = await rail.boundingBox();
      const right = await terms.boundingBox();
      expect(left!.x + left!.width).toBeLessThanOrEqual(prose!.x);
      expect(right!.x).toBeGreaterThanOrEqual(prose!.x + prose!.width);
      expect(lab!.x).toBe(left!.x);
      expect(lab!.width).toBeGreaterThan(prose!.width);
      await expect(page.locator(".sheet-local-inner")).toHaveCSS("position", "sticky");
      for (const note of await page.locator(".sheet-term-note").all()) await expect(note).toBeHidden();
    } else {
      await expect(terms).toBeHidden();
      await expect(contents).toBeHidden();
      await expect(page.locator(".sheet-local-inner")).toHaveCSS("position", "static");
      const summary = page.locator(".sheet-contents > summary");
      await expect(summary).toBeVisible();
      expect((await summary.boundingBox())!.height).toBeGreaterThanOrEqual(44);
      for (const note of await page.locator(".sheet-term-note").all()) {
        await expect(note).toBeVisible();
        expect(await note.evaluate((element) => element.previousElementSibling?.tagName)).toBe("P");
      }
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("sheet reading context gives records distinct readable treatments", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  const warning = page.getByRole("region", { name: "Break it: discard the context", exact: true });
  await expect(warning).toContainText("Warning:");
  await expect(warning).toHaveCSS("border-left-color", "oklch(0.62 0.2 28)");
  const ledger = page.getByRole("table", { name: "Causal metadata costs", exact: true });
  await expect(ledger.getByRole("row")).toHaveCount(4);
  const code = page.locator(".sheet-continuation pre");
  await expect(code.locator(".line").first()).toHaveCSS("counter-increment", "code-line 1");
  const numberContrast = await code.evaluate((element) => {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Cannot measure rendered code colors");
    const luminance = (color: string) => {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const channels = Array.from(context.getImageData(0, 0, 1, 1).data).slice(0, 3)
        .map((channel) => channel / 255)
        .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };
    const line = element.querySelector(".line");
    if (!line) throw new Error("Pseudocode lines are missing");
    const foreground = luminance(getComputedStyle(line, "::before").color);
    const background = luminance(getComputedStyle(element).backgroundColor);
    return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
  });
  expect(numberContrast).toBeGreaterThanOrEqual(4.5);
  const notes = page.getByRole("region", { name: "Field notes", exact: true });
  await expect(notes).toHaveCSS("border-top-style", "solid");
  for (const width of [390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const figure = page.locator(".sheet-opening figure");
    expect((await figure.boundingBox())!.width).toBe((await page.locator(".sheet-opening").boundingBox())!.width);
    await expect(code).toHaveCSS("overflow-x", "auto");
    await expect(ledger.locator("th").first()).toHaveCSS("position", "static");
    await expect(ledger.locator("th").first()).toHaveCSS("text-align", "start");
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
  }
});

test("the connected chart reflows to vertical stations below 40rem", async ({ page }) => {
  await page.goto("/atlas/");
  for (const width of [320, 390, 639, 640, 768, 1024, 1025, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.evaluate(() => document.fonts.ready);
    const chart = page.getByTestId("territory-chart");
    const mechanisms = page.getByTestId("territory-mechanisms");
    const stations = mechanisms.getByRole("listitem");
    await expect(stations).toHaveCount(5);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(width);
    const first = await stations.nth(0).boundingBox();
    const second = await stations.nth(1).boundingBox();
    const heading = await mechanisms.getByRole("heading", { name: "Mechanisms", exact: true }).boundingBox();
    const list = await mechanisms.getByRole("list").boundingBox();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(heading).not.toBeNull();
    expect(list).not.toBeNull();
    if (width < 640) {
      expect(second!.x).toBe(first!.x);
      expect(second!.y).toBeGreaterThanOrEqual(first!.y + first!.height);
      for (const trace of await chart.locator(".territory-connector").all()) {
        await expect(trace).toBeHidden();
      }
    } else {
      expect(second!.x).toBeGreaterThan(first!.x);
      expect(second!.y).toBe(first!.y);
      for (const trace of await chart.locator(".territory-connector").all()) {
        await expect(trace).toBeVisible();
        await expect(trace).toHaveAttribute("aria-hidden", "true");
      }
      const field = await mechanisms.locator(".territory-field").boundingBox();
      for (const station of (await stations.all()).slice(1)) {
        const box = await station.boundingBox();
        if (box!.x === first!.x) {
          const trace = station.locator(".station-trace");
          await expect(trace).toBeVisible();
          await expect(trace).toHaveAttribute("aria-hidden", "true");
          const traceBox = await trace.boundingBox();
          expect(traceBox!.x).toBe(field!.x);
          expect(traceBox!.x + traceBox!.width).toBe(box!.x);
        }
      }
    }
    if (width > 1024) {
      expect(heading!.x + heading!.width).toBeLessThanOrEqual(list!.x);
    } else {
      expect(heading!.y + heading!.height).toBeLessThanOrEqual(list!.y);
    }
    for (const station of await chart.getByRole("listitem").all()) {
      await expect(station).toBeVisible();
      const box = await station.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(width);
      const fontSize = await station.getByRole("heading").evaluate((element) =>
        parseFloat(getComputedStyle(element).fontSize),
      );
      expect(fontSize).toBeGreaterThanOrEqual(18);
    }
    const link = chart.getByRole("link", { name: "Dots and causal context", exact: true });
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    const dense = await mechanisms.boundingBox();
    const empty = await page.getByTestId("territory-systems").boundingBox();
    expect(dense!.height).toBeGreaterThan(empty!.height);
  }
});

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
