import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const plannedTitles = [
  "Local history",
  "Partial order",
  "Lamport clocks",
  "Vector clocks",
  "Multi-value registers",
  "Observed-remove sets",
];

test("a sheet exposes its reading context and next step", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");

  const contents = page.locator(".sheet-local").first()
    .getByRole("navigation", { name: "On this sheet", exact: true });
  await expect(contents).toBeVisible();
  const headings = page.locator(".sheet-body h2");
  for (const heading of await headings.all()) {
    if (await heading.evaluate((element) => Boolean(element.closest("causal-lab")))) continue;
    const id = await heading.getAttribute("id");
    expect(id).toBeTruthy();
    await expect(contents.getByRole("link", { name: await heading.innerText(), exact: true }))
      .toHaveAttribute("href", `#${id}`);
  }
  const terms = page.getByRole("complementary", { name: "Terms on this sheet" });
  await expect(terms).toContainText("dot");
  await expect(terms.locator("dt")).toHaveText(["dot", "causal context"]);
  await expect(terms.locator("p")).toHaveCount(0);
  await expect(page.locator(".sheet-header")).toContainText(/\d+ min read/);
  await expect(page.locator(".sheet-header")).toContainText("Lab available");
  await expect(page.locator(".sheet-header")).toContainText("No prerequisite sheet");
  await expect(page.locator(".sheet-header")).toContainText("First trail · 5 of 7");
  await expect(page.getByRole("heading", { name: "Field notes", exact: true })).toBeVisible();
  const related = page.getByRole("navigation", { name: "Related sheets", exact: true });
  await expect(related).toContainText("No related sheets");
  await expect(related.getByRole("link")).toHaveCount(0);
  const next = page.getByRole("navigation", { name: "Next trail step", exact: true });
  await expect(next).toContainText("Multi-value registers");
  await expect(next).toContainText("Planned");
  await expect(next.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "References", exact: true })).toContainText("Dotted Version Vectors");
  await contents.getByRole("link", { name: "Field notes", exact: true }).click();
  await expect(page).toHaveURL(/#field-notes$/);
  await expect(page.getByRole("heading", { name: "Field notes", exact: true })).toBeInViewport();
});

test("reading context disclosure and references work without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
  try {
    const page = await context.newPage();
    await page.goto("/atlas/dots-and-causal-context/");
    const disclosure = page.locator(".sheet-contents").first();
    const contents = page.getByRole("navigation", { name: "On this sheet", exact: true });
    await expect(contents).toBeHidden();
    await disclosure.locator("summary").focus();
    await page.keyboard.press("Enter");
    await expect(contents).toBeVisible();
    await expect(disclosure.locator("summary")).toHaveCSS("outline-style", "solid");
    await contents.getByRole("link", { name: "Context records what a replica has observed", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Context records what a replica has observed", exact: true }))
      .toBeInViewport();
    await expect(page.locator(".sheet-term-note")).toHaveCount(2);
    await page.getByRole("link", { name: "Reference: Dotted Version Vectors", exact: true }).click();
    await expect(page.getByRole("region", { name: "References", exact: true })).toBeInViewport();
  } finally {
    await context.close();
  }
});

test("the shell distinguishes working and planned navigation", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Primary", exact: true });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Atlas", exact: true })).toHaveAttribute(
    "href",
    "/atlas/",
  );
  for (const label of ["Trails", "Glossary", "References"]) {
    const item = nav.getByText(label, { exact: true }).locator("..");
    await expect(item).toContainText("Planned");
    await expect(item.locator("a, button, [tabindex]")).toHaveCount(0);
  }
  await page.goto("/atlas/dots-and-causal-context/");
  await expect(nav.getByRole("link", { name: "Atlas", exact: true }))
    .toHaveAttribute("aria-current", "location");
});

test("the observation rail shows route context without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const rail = page.getByRole("navigation", { name: "Sheet position", exact: true });
    for (const route of ["/", "/atlas/"]) {
      await page.goto(route);
      await expect(rail.getByRole("listitem")).toHaveText(["Atlas"]);
    }
    await page.goto("/atlas/dots-and-causal-context/");
    await expect(rail.getByRole("listitem")).toHaveText([
      "Atlas", "Mechanisms", "Dots and causal context", "Trail 5 of 7",
    ]);
    await expect(rail.locator('[aria-current="page"]')).toHaveText("Dots and causal context");
  } finally {
    await context.close();
  }
});

test("the observation rail shell keeps a quiet footer with planned resources", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("A place to study what replicas know.");
  await expect(footer.getByRole("link")).toHaveCount(0);
  for (const label of ["Source", "Bibliography"]) {
    const item = footer.getByText(label, { exact: true }).locator("..");
    await expect(item).toContainText("Planned");
    await expect(item.locator("a, button, [tabindex]")).toHaveCount(0);
  }
  await expect(footer.getByRole("navigation")).toHaveCount(0);
});

test("Dots sheet contains the full teaching sequence", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");

  for (const heading of [
    "One event needs one name",
    "A dot is identity, not a timestamp",
    "Context records what a replica has observed",
    "Interactive lab",
    "Remove only what you saw",
    "Break it: discard the context",
    "What causal metadata costs",
    "Field notes",
  ]) {
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

test("Dots sheet is a complete article without JavaScript", async ({ browser, request }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/atlas/");
    const sheetLink = page.getByTestId("territory-chart").getByRole("link", { name: "Dots and causal context", exact: true });
    await expect(sheetLink).toBeVisible();
    await sheetLink.click();
    await expect(page).toHaveURL(/\/atlas\/dots-and-causal-context\/$/);
    await expect(page).toHaveTitle("Dots and causal context | Distributed Systems Atlas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dots and causal context");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute(
      "content", "Track one event and the exact history that has observed it.",
    );
    await expect(page.getByRole("heading", { name: "Field notes", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Dotted Version Vectors", exact: true }))
      .toHaveAttribute("href", "https://riak.com/posts/technical/vector-clocks-revisited-part-2-dotted-version-vectors/");
    const wordCount = await page.locator(".sheet-body").evaluate((body) => {
      const copy = body.cloneNode(true) as HTMLElement;
      copy.querySelectorAll("causal-lab, pre").forEach((element) => element.remove());
      return (copy.textContent ?? "").match(/\b[\w]+(?:['’-][\w]+)*\b/g)?.length ?? 0;
    });
    expect(wordCount).toBeGreaterThanOrEqual(1800);
    expect(wordCount).toBeLessThanOrEqual(2800);
    expect((await request.get("/lab-test/")).status()).toBe(404);
  } finally {
    await context.close();
  }
});

async function buildFixture(root: string) {
  try {
    const result = await promisify(execFile)(
      process.execPath,
      [path.resolve("node_modules/astro/bin/astro.mjs"), "build", "--root", root],
      { cwd: root, timeout: 60_000 },
    );
    return { code: 0, output: result.stdout + result.stderr };
  } catch (error) {
    if (!(error instanceof Error) || !("stdout" in error) || !("stderr" in error)) throw error;
    return { code: 1, output: String(error.stdout) + String(error.stderr) };
  }
}

test("the landing page demonstrates the premise before explaining it", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Two stations can be correct and still disagree",
  );
  await expect(
    page.getByRole("link", { name: "Begin with dots and causal context", exact: true }),
  ).toHaveAttribute("href", "/atlas/dots-and-causal-context/");
  await expect(page.getByRole("link", { name: "Open the atlas", exact: true }))
    .toHaveAttribute("href", "/atlas/");
  const figure = page.getByRole("figure");
  await expect(figure.getByText("Station A records A:1", { exact: true })).toBeVisible();
  await expect(figure.getByText("Station B records B:1", { exact: true })).toBeVisible();
  await expect(figure).toContainText(
    "Concurrent — neither station has observed the other event",
  );
  await expect(page.getByRole("heading", { level: 2 })).toHaveText([
    "What the atlas lets you inspect",
    "One trail, seven connected ideas",
    "Read it or run it",
  ]);
  const trail = page.getByRole("list", { name: "First-release learning sequence" });
  await expect(trail.getByRole("listitem")).toHaveText([
    "Local history Planned",
    "Partial order Planned",
    "Lamport clocks Planned",
    "Vector clocks Planned",
    "Dots and causal context Read now",
    "Multi-value registers Planned",
    "Observed-remove sets Planned",
  ]);
  await expect(trail.getByRole("link")).toHaveCount(1);
  const finalEntry = page.getByRole("link", { name: "Read dots and causal context", exact: true });
  await finalEntry.click();
  await expect(page).toHaveURL(/\/atlas\/dots-and-causal-context\/$/);
});

test("landing page works without client JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Two stations can be correct and still disagree",
  );
  const figure = page.getByRole("figure");
  await expect(figure.getByText("Station A records A:1", { exact: true })).toBeVisible();
  await expect(figure.getByText("Station B records B:1", { exact: true })).toBeVisible();
  await expect(figure).toContainText(
    "Concurrent — neither station has observed the other event",
  );
  await expect(page.getByRole("link", { name: "Begin with dots and causal context", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open the atlas" })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  const primary = page.getByRole("link", { name: "Begin with dots and causal context", exact: true });
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/atlas\/dots-and-causal-context\/$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Open the atlas" }).click();
  await expect(page.getByRole("heading", { name: "Atlas", exact: true })).toBeVisible();
  await context.close();
});

test("atlas exposes four territories and planned sheets without dead links", async ({ page, request }) => {
  await page.goto("/atlas/");
  for (const name of ["Mechanisms", "Structures", "Failure modes", "Systems"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  for (const title of plannedTitles) {
    await expect(page.getByRole("heading", { name: title, exact: true }).locator("..")).toContainText("Planned");
    await expect(page.getByRole("link", { name: title, exact: true })).toHaveCount(0);
  }
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveCount(1);
  await expect(nav.getByRole("link", { name: "Atlas", exact: true })).toHaveAttribute("aria-current", "page");
  for (const title of ["Trails", "Glossary", "References"]) {
    await expect(nav.getByText(title, { exact: true }).locator("..")).toContainText("Planned");
    expect((await request.get(`/${title.toLowerCase()}/`)).status()).toBe(404);
  }
  for (const id of ["local-history", "partial-order", "lamport-clocks", "vector-clocks", "multi-value-registers", "observed-remove-sets"]) {
    expect((await request.get(`/atlas/${id}/`)).status()).toBe(404);
  }
});

test("the atlas presents territories as one connected chart without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/atlas/");
    const chart = page.getByTestId("territory-chart");
    await expect(chart).toBeVisible();
    await expect(chart.getByRole("heading", { level: 2 })).toHaveText([
      "Mechanisms", "Structures", "Failure modes", "Systems",
    ]);
    const mechanisms = page.getByTestId("territory-mechanisms");
    await expect(mechanisms.getByRole("heading", { level: 3 })).toHaveText([
      "Local history", "Partial order", "Lamport clocks", "Vector clocks", "Dots and causal context",
    ]);
    await expect(page.getByTestId("territory-structures").getByRole("heading", { level: 3 }))
      .toHaveText(["Multi-value registers", "Observed-remove sets"]);
    await expect(chart.getByRole("listitem")).toHaveCount(7);
    for (const title of plannedTitles) {
      const station = chart.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await expect(station).toContainText("Planned");
      await expect(station.locator("a, button, [tabindex]")).toHaveCount(0);
    }
    const trail = page.getByRole("list", { name: "First trail", exact: true });
    await expect(trail.getByRole("listitem")).toHaveText([
      "Local history Planned", "Partial order Planned", "Lamport clocks Planned",
      "Vector clocks Planned", "Dots and causal context Read now",
      "Multi-value registers Planned", "Observed-remove sets Planned",
    ]);
    await expect(trail.getByRole("link")).toHaveCount(1);
    await expect(chart.getByRole("link")).toHaveCount(1);
    const published = chart.getByRole("link", { name: "Dots and causal context", exact: true });
    await expect(published).toHaveAttribute("href", "/atlas/dots-and-causal-context/");
    await published.focus();
    await expect(published).toHaveCSS("outline-style", "solid");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/atlas\/dots-and-causal-context\/$/);
  } finally {
    await context.close();
  }
});

test("atlas shell reflows and retains keyboard focus at narrow widths", async ({ page }) => {
  for (const width of [320, 768, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/atlas/");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
    await expect(page.getByRole("link", { name: "Skip to content" })).toHaveCSS("outline-style", "solid");
  }
});

test.describe("collection build fixtures", () => {
  let root: string;

  test.beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), "atlas-shell-"));
    await cp("src", path.join(root, "src"), { recursive: true });
    for (const file of ["astro.config.mjs", "tsconfig.json", "package.json"]) {
      await cp(file, path.join(root, file));
    }
    const configPath = path.join(root, "astro.config.mjs");
    const config = await readFile(configPath, "utf8");
    await writeFile(
      configPath,
      config.replace(
        "export default defineConfig({",
        'export default defineConfig({\n  cacheDir: "./.astro",\n  vite: { cacheDir: "./.vite" },',
      ),
    );
    await symlink(path.resolve("node_modules"), path.join(root, "node_modules"), "dir");
    await mkdir(path.join(root, "src/content/sheets"), { recursive: true });
    await rm(path.join(root, "src/content/sheets/dots-and-causal-context.mdx"), { force: true });
    const sheets = [
      { id: "dots-and-causal-context", title: "Dots and causal context", territory: "mechanisms", status: "published", requires: ["local-history", "failure-detectors"], related: ["replicated-log", "failure-detectors"] },
      { id: "local-history", title: "Local history", territory: "mechanisms", status: "published" },
      { id: "failure-detectors", title: "Failure detectors", territory: "failures", status: "planned" },
      { id: "replicated-log", title: "Replicated log", territory: "systems", status: "published" },
    ];
    for (const { id, ...data } of sheets) {
      const body = id === "replicated-log"
        ? "word ".repeat(399)
        : `An event belongs to one replica.\n\n\`\`\`text\n${"code ".repeat(400)}\n\`\`\``;
      await writeFile(path.join(root, `src/content/sheets/${id}.md`),
        `---\n${JSON.stringify({ ...data, summary: `Explore ${data.title.toLowerCase()}.` })}\n---\n\n## Fixture article\n\n${body}\n`);
    }
  });

  test.afterAll(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  test("atlas exposes published collection entries and sheet reading context", async ({ page }) => {
    test.setTimeout(90_000);
    const result = await buildFixture(root);
    expect(result.code, result.output).toBe(0);
    await expect(readFile(path.join(root, "dist/atlas/failure-detectors/index.html"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      readFile(path.resolve("node_modules/.astro/data-store.json"), "utf8"),
    ).resolves.not.toContain("Fixture article");
    await page.setContent(await readFile(path.join(root, "dist/atlas/index.html"), "utf8"));
    const chart = page.getByTestId("territory-chart");
    await expect(chart.getByRole("link", { name: "Dots and causal context", exact: true })).toHaveAttribute("href", "/atlas/dots-and-causal-context/");
    await expect(chart.getByText("Lamport clocks").locator("..")).toContainText("Planned");
    await expect(page.getByRole("heading", { name: "Local history", exact: true })).toHaveCount(1);
    await expect(chart.getByRole("link", { name: "Local history", exact: true })).toBeVisible();
    const dots = chart.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Dots and causal context", exact: true }) });
    await expect(dots).toContainText("Requires: Local history, Failure detectors");
    await expect(dots.getByRole("link")).toHaveCount(1);
    await expect(page.getByRole("region", { name: "Systems", exact: true }).getByRole("link", { name: "Replicated log" })).toBeVisible();
    await expect(page.getByRole("region", { name: "Failure modes", exact: true })).toContainText("Failure detectors");
    await expect(page.getByRole("link", { name: "Failure detectors" })).toHaveCount(0);

    await page.setContent(await readFile(path.join(root, "dist/atlas/dots-and-causal-context/index.html"), "utf8"));
    await expect(page).toHaveTitle("Dots and causal context | Distributed Systems Atlas");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dots and causal context");
    await expect(page.getByRole("article")).toContainText("Mechanisms");
    await expect(page.getByRole("article")).toContainText("Explore dots and causal context.");
    await expect(page.locator(".sheet-header")).toContainText("1 min read");
    await expect(page.locator(".sheet-header")).toContainText("No lab on this sheet");
    await expect(page.getByRole("complementary", { name: "Terms on this sheet" })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Fixture article" })).toBeVisible();
    const prerequisites = page.getByRole("navigation", { name: "Prerequisites" });
    await expect(prerequisites.getByRole("link", { name: "Local history" })).toHaveAttribute("href", "/atlas/local-history/");
    await expect(prerequisites).toContainText("Failure detectors");
    await expect(prerequisites).toContainText("Planned");
    await expect(prerequisites.getByRole("link")).toHaveCount(1);
    const related = page.getByRole("navigation", { name: "Related sheets" });
    await expect(related.getByRole("link", { name: "Replicated log" })).toHaveAttribute("href", "/atlas/replicated-log/");
    await expect(related.getByRole("link")).toHaveCount(1);
    const next = page.getByRole("navigation", { name: "Next trail step" });
    await expect(next).toContainText("Multi-value registers");
    await expect(next).toContainText("Planned");
    await expect(next.getByRole("link")).toHaveCount(0);

    await page.setContent(await readFile(path.join(root, "dist/atlas/local-history/index.html"), "utf8"));
    const rail = page.getByRole("navigation", { name: "Sheet position", exact: true });
    await expect(rail.getByRole("listitem")).toHaveText([
      "Atlas", "Mechanisms", "Local history", "Trail 1 of 7",
    ]);
    await expect(page.getByText("No prerequisite sheet", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Next trail step" })).toContainText("Partial order");
    await page.setContent(await readFile(path.join(root, "dist/atlas/replicated-log/index.html"), "utf8"));
    await expect(page.locator(".sheet-header")).toContainText("3 min read");
    await expect(rail.getByRole("listitem")).toHaveText(["Atlas", "Systems", "Replicated log"]);
    await expect(page.getByRole("navigation", { name: "Next trail step" })).toHaveCount(0);
  });

  test("atlas rejects every missing graph reference in one build error", async () => {
    test.setTimeout(90_000);
    await writeFile(path.join(root, "src/content/sheets/broken.md"), `---
title: Broken graph
summary: A deliberately invalid test fixture.
territory: mechanisms
status: planned
requires: [missing-prerequisite]
related: [missing-related]
---
`);
    const result = await buildFixture(root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Invalid atlas content graph:");
    expect(result.output).toContain("broken.requires: missing sheet missing-prerequisite");
    expect(result.output).toContain("broken.related: missing sheet missing-related");
  });
});
