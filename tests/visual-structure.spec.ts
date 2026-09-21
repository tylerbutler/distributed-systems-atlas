import { expect, test } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";

test("the standalone publication has its own Impeccable product record", () => {
  const productPath = new URL("../PRODUCT.md", import.meta.url);
  expect(existsSync(productPath), "PRODUCT.md must belong to this publication").toBe(true);
  const product = readFileSync(productPath, "utf8");
  expect(product).toContain("<!-- impeccable:product-schema 1 -->");
  expect(product).toMatch(/^## Platform\s+web\s*$/m);
  for (const heading of ["Users", "Product Purpose", "Capabilities and Constraints", "Accessibility & Inclusion"]) {
    expect(product).toContain(`## ${heading}\n`);
  }
  expect(product).toContain("Distributed Systems Atlas");
});

for (const route of ["/", "/atlas/", "/atlas/dots-and-causal-context/"]) {
  test(`the emitted direction contract leads the body on ${route}`, async ({ page }) => {
    const response = await page.goto(route);
    const html = await response!.text();
    const contract = html.match(/<body\b[^>]*>\s*<!--([\s\S]*?)-->/)?.[1]?.trim();
    expect(contract, "the root layout must emit its opening direction comment").toBeTruthy();
    expect(contract).toMatch(
      /^THESIS:[\s\S]+OWN-WORLD:[\s\S]+STORY:[\s\S]+FIRST VIEWPORT:[\s\S]+FORM:[\s\S]+FINISH:/,
    );
    expect(contract!.split(/\s+/).length).toBeLessThanOrEqual(150);
    expect(contract).toMatch(/FORM:[^\n]*brief-pinned[^\n]*seed key [a-f0-9]{8}\b/);
    expect(contract).toContain(
      "FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance",
    );
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  });
}

for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 1000 }]) {
  test(`break-it interference uses a one-pixel rule at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await page.goto("/atlas/dots-and-causal-context/");
    const warning = page.getByRole("region", { name: "Break it: discard the context" });
    await expect(warning).toBeVisible();
    await expect(warning).toHaveCSS("border-left-width", "1px");
    await expect(warning).toHaveCSS("border-left-style", "solid");
    await expect(warning).toHaveCSS("border-left-color", "oklch(0.62 0.2 28)");
    await expect(warning).toContainText("Warning: Discarding event identity changes what a remove can mean.");
  });
}

test("concurrent add and remove have identical observation outcomes with reduced motion", async ({ page }) => {
  const outcomes: string[][] = [];
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    await page.goto("/atlas/dots-and-causal-context/");
    const lab = page.getByTestId("causal-lab");
    for (const name of [
      "Add beacon at A", "Add beacon at B", "Partition A and B",
      "Remove beacon at A", "Add beacon at B",
    ]) {
      await lab.getByRole("button", { name, exact: true }).click();
      await expect(lab).not.toHaveAttribute("aria-busy", "true");
    }
    await expect(lab.getByRole("region", { name: "Replica A", exact: true })).toContainText("Empty set");
    await expect(lab.getByRole("region", { name: "Replica B", exact: true })).toContainText("B:1, B:2");
    await expect(lab.getByRole("region", { name: "Vector comparison" })).toContainText("A and B are concurrent");
    await expect(lab.getByRole("list", { name: "Messages in flight" }).getByRole("listitem")).toHaveCount(4);
    await expect(lab.getByRole("button", { name: /^Deliver / })).toHaveCount(4);
    for (const deliver of await lab.getByRole("button", { name: /^Deliver / }).all()) {
      await expect(deliver).toBeDisabled();
    }
    await expect(lab.getByRole("navigation", { name: "Trace history" }).locator('[aria-current="step"]'))
      .toHaveText("Frame 5: add beacon at B");
    await expect(lab.getByRole("region", { name: "Invariant checks" })).toContainText("Converged: no");
    outcomes.push(await lab.locator(
      ".lab-replicas, .lab-messages, .lab-comparison, .lab-trace nav, .lab-inspector, .lab-invariants, [role=status]",
    ).allTextContents());
  }
  expect(outcomes[1]).toEqual(outcomes[0]);
});

test("the publication exposes its observatory foundation", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveCSS("background-color", "oklch(0.96 0.025 225)");
  const header = page.getByRole("banner");
  await expect(header).toHaveCSS("background-color", "oklch(0.29 0.075 238)");
  await expect(header.getByTestId("station-mark-a")).toBeVisible();
  await expect(header.getByTestId("station-mark-b")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("observatory foundation keeps labeled station geometry without JavaScript or motion", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, reducedMotion: "reduce" });
  try {
    const page = await context.newPage();
    await page.goto("/");
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      const header = page.getByRole("banner");
      const a = header.getByTestId("station-mark-a");
      const b = header.getByTestId("station-mark-b");
      await expect(a).toBeVisible();
      await expect(b).toBeVisible();
      await expect(a).toContainText("A");
      await expect(b).toContainText("B");
      await expect(a).toHaveAttribute("aria-hidden", "true");
      await expect(b).toHaveAttribute("aria-hidden", "true");
      await expect(a.locator("circle")).toBeVisible();
      await expect(b.locator("polygon")).toBeVisible();
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await expect(page.locator("body")).toHaveCSS("font-family", /Roboto Serif Variable/);
    await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCSS("font-family", /Encode Sans Variable/);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveCSS("outline-color", "oklch(0.29 0.075 238)");
  } finally {
    await context.close();
  }
});

test("observatory foundation primitives provide field-aware focus and type roles", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").evaluate((main) => {
    const field = document.createElement("section");
    field.id = "foundation-test-panel";
    field.className = "instrument-panel";
    field.innerHTML = '<button>Inspect station</button><div class="chart-field"><button>Read record</button><span class="observation-label">Replica A</span><code>A:1</code></div><div class="signal-rule"></div>';
    main.append(field);
  });
  const panel = page.locator("#foundation-test-panel");
  await expect(panel).toHaveCSS("background-color", "oklch(0.29 0.075 238)");
  const inspect = page.getByRole("button", { name: "Inspect station" });
  await inspect.focus();
  await expect(inspect).toHaveCSS("outline-color", "oklch(0.84 0.18 100)");
  await expect(inspect).toHaveCSS("font-family", /Encode Sans Variable/);
  const read = page.getByRole("button", { name: "Read record" });
  await page.keyboard.press("Tab");
  await expect(read).toBeFocused();
  await expect(read).toHaveCSS("outline-color", "oklch(0.29 0.075 238)");
  await expect(page.locator(".chart-field")).toHaveCSS("background-color", "oklch(0.96 0.025 225)");
  await expect(page.locator(".observation-label")).toHaveCSS("font-family", /Encode Sans Variable/);
  await expect(panel.locator("code")).toHaveCSS("font-family", /Azeret Mono Variable/);
  await expect(page.locator(".signal-rule")).toHaveCSS("height", "2px");
});

test("causal lab assigns data and prose their computed font roles", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  const lab = page.getByTestId("causal-lab");

  await expect(lab.getByText("Frame 0 of 0", { exact: true }))
    .toHaveCSS("font-family", /Azeret Mono Variable/);

  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  const messageId = lab.getByText("Message ID", { exact: true })
    .locator("xpath=following-sibling::dd[1]");
  await expect(messageId).toHaveCSS("font-family", /Azeret Mono Variable/);

  await lab.getByRole("button", { name: "Partition A and B", exact: true }).click();
  const deliver = lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true });
  await deliver.evaluate((button: HTMLButtonElement) => {
    button.disabled = false;
    button.click();
  });
  const error = lab.getByText("Error", { exact: true })
    .locator("xpath=following-sibling::dd[1]");
  await expect(error).toHaveCSS("font-family", /Roboto Serif Variable/);
});
