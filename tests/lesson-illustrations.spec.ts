import { expect, test } from "@playwright/test";
import { readdirSync } from "node:fs";
import catalog from "../art/lesson-illustrations.json" with { type: "json" };

const { illustrations } = catalog;

test("the complete catalog has accessible, self-contained SVG masters", async ({ page, request }) => {
  expect(illustrations).toHaveLength(35);
  expect(new Set(illustrations.map(({ id }) => id)).size).toBe(illustrations.length);
  const files = readdirSync(new URL("../public/illustrations/lessons/", import.meta.url));
  expect(files.filter((file) => file.endsWith(".svg")).sort()).toEqual(
    illustrations.map(({ id }) => `${id}.svg`).sort(),
  );

  for (const { id, asset, alt } of illustrations) {
    await test.step(id, async () => {
      expect(asset).toBe(`/illustrations/lessons/${id}.svg`);
      expect(alt.trim().length).toBeGreaterThan(20);
      const response = await request.get(asset);
      expect(response.ok()).toBe(true);
      const source = await response.text();
      expect(source).not.toMatch(/<!DOCTYPE|<!ENTITY|@import|@font-face|font-family/i);
      for (const match of source.matchAll(/url\(([^)]+)\)/g)) {
        expect(match[1]).toMatch(/^#[\w-]+$/);
      }
      const result = await page.evaluate((source) => {
        const xml = new DOMParser().parseFromString(source, "image/svg+xml");
        if (xml.querySelector("parsererror")) throw new Error("Invalid SVG XML");
        const svg = xml.documentElement;
        if (!(svg instanceof SVGSVGElement)) throw new Error("Missing SVG root");
        const nodes = [svg, ...svg.querySelectorAll("*")];
        const ids = nodes.flatMap((node) => node.id ? [node.id] : []);
        const references = nodes.flatMap((node) => [...node.attributes]
          .filter(({ localName }) => localName === "href")
          .map(({ value }) => value));
        const labels = (svg.getAttribute("aria-labelledby") ?? "").split(/\s+/)
          .map((id) => xml.getElementById(id)?.textContent?.trim() ?? "");
        document.body.replaceChildren(document.importNode(svg, true));
        const rendered = document.querySelector("svg");
        if (!rendered) throw new Error("SVG was not mounted");
        const bounds = rendered.getBBox();
        return {
          width: svg.getAttribute("width"),
          height: svg.getAttribute("height"),
          viewBox: svg.getAttribute("viewBox"),
          role: svg.getAttribute("role"),
          forbidden: svg.querySelectorAll("script, foreignObject, image, text, animate, animateTransform, set, a").length,
          eventHandlers: nodes.flatMap((node) => [...node.attributes])
            .filter(({ name }) => /^on/i.test(name)).length,
          ids,
          references,
          labels,
          bounds: { x: bounds.x, y: bounds.y, right: bounds.x + bounds.width, bottom: bounds.y + bounds.height },
        };
      }, source);
      expect(result).toMatchObject({
        width: "900", height: "600", viewBox: "0 0 900 600", role: "img",
        forbidden: 0, eventHandlers: 0,
      });
      expect(result.labels).toHaveLength(2);
      for (const label of result.labels) expect(label.length).toBeGreaterThan(15);
      expect(new Set(result.ids).size).toBe(result.ids.length);
      for (const reference of result.references) {
        expect(reference).toMatch(/^#[\w-]+$/);
        expect(result.ids).toContain(reference.slice(1));
      }
      for (const match of source.matchAll(/url\(#([\w-]+)\)/g)) {
        expect(result.ids).toContain(match[1]);
      }
      expect(result.bounds.x).toBeGreaterThanOrEqual(72);
      expect(result.bounds.y).toBeGreaterThanOrEqual(48);
      expect(result.bounds.right).toBeLessThanOrEqual(828);
      expect(result.bounds.bottom).toBeLessThanOrEqual(552);
    });
  }
});

for (const width of [1440, 360]) {
  test.describe(`lesson illustrations at ${width}px`, () => {
    test.use({ javaScriptEnabled: false, viewport: { width, height: 900 } });

    for (const { id, route, asset, alt, kind } of illustrations) {
      test(`${id} loads its artwork without JavaScript`, async ({ page }) => {
        await page.goto(route);
        const header = page.locator(kind === "reference" ? ".sheet-header" : ".page-intro");
        const image = header.locator("img.lesson-illustration");
        await expect(image).toHaveCount(1);
        await expect(image).toBeVisible();
        await expect(image).toHaveAttribute("src", asset);
        await expect(image).toHaveAttribute("alt", alt);
        await expect(image).toHaveAttribute("width", "900");
        await expect(image).toHaveAttribute("height", "600");
        await expect(image).toHaveJSProperty("naturalWidth", 900);
        await expect(image).toHaveJSProperty("naturalHeight", 600);

        if (["structures-counters", "structures-sets", "structures-registers", "structures-maps"].includes(id)) {
          await expect(page.locator(".page-intro > p").last()).toHaveCSS(
            "font-size",
            "19.2px",
          );
        }

        const bounds = await image.boundingBox();
        if (!bounds) throw new Error(`Missing illustration bounds for ${id}`);
        expect(bounds.x).toBeGreaterThanOrEqual(0);
        expect(bounds.x + bounds.width).toBeLessThanOrEqual(width);
        expect(bounds.height / bounds.width).toBeCloseTo(2 / 3, 2);

        if (["structures-g-counter", "structures-pn-counter", "structures-shared-counter"].includes(id)) {
          await expect(page.locator(".counter-illustration svg")).toBeVisible();
        }
      });
    }
  });
}
