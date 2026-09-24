import { expect, test } from "@playwright/test";
import { execFile } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, realpath, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { remainingStructures } from "../src/lib/structure-demo/remaining-structures";
import { firstTrail, pairedSheets } from "../src/lib/atlas/trail";
import { structureGroups, structureNextLinks } from "../src/lib/structure-demo/structure-navigation";

const trailTitles = [
  "Multi-value registers",
  "Observed-remove sets",
  "Local history",
  "Partial order",
  "Lamport clocks",
  "Vector clocks",
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
  await expect(page.locator(".sheet-header")).toContainText("No supporting sheet required");
  await expect(page.locator(".sheet-header")).toContainText("Structure-first trail · 3 of 7");
  await expect(page.getByRole("heading", { name: "Field notes", exact: true })).toBeVisible();
  const related = page.getByRole("navigation", { name: "Related sheets", exact: true });
  await expect(related).toContainText("No related sheets");
  await expect(related.getByRole("link")).toHaveCount(0);
  const next = page.getByRole("navigation", { name: "Next in the structure-first trail", exact: true });
  await expect(next).toContainText("Local history");
  await expect(next.getByRole("link")).toHaveAttribute("href", "/atlas/local-history/");
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
    await expect(page).toHaveURL(/\/bibliography\/#riak-dotted-version-vectors$/);
    await expect(page.locator("#riak-dotted-version-vectors")).toBeInViewport();
  } finally {
    await context.close();
  }
});

test("the shell exposes only working navigation", async ({ page }) => {
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Primary", exact: true });
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(nav.getByRole("link", { name: "Structures", exact: true })).toHaveAttribute(
    "href",
    "/structures/",
  );
  await expect(nav.getByRole("link", { name: "Reference atlas", exact: true })).toHaveAttribute(
    "href",
    "/atlas/",
  );
  await expect(nav.getByRole("link", { name: "Glossary", exact: true })).toHaveAttribute("href", "/glossary/");
  await expect(nav.getByRole("link", { name: "Bibliography", exact: true })).toHaveAttribute("href", "/bibliography/");
  await expect(nav.getByText("Trails", { exact: true })).toHaveCount(0);
  await page.goto("/atlas/dots-and-causal-context/");
  await expect(nav.getByRole("link", { name: "Reference atlas", exact: true }))
    .toHaveAttribute("aria-current", "location");
});

test("the observation rail shows route context without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    const rail = page.getByRole("navigation", { name: "Sheet position", exact: true });
    await page.goto("/");
    await expect(rail.getByRole("listitem")).toHaveText(["Home"]);
    await page.goto("/atlas/");
    await expect(rail.getByRole("listitem")).toHaveText(["Reference atlas"]);
    await page.goto("/atlas/dots-and-causal-context/");
    await expect(rail.getByRole("listitem")).toHaveText([
      "Reference atlas", "Mechanisms", "Dots and causal context", "Trail 3 of 7",
    ]);
    await expect(rail.locator('[aria-current="page"]')).toHaveText("Dots and causal context");
    await expect(rail.getByRole("link", { name: "Mechanisms" })).toHaveAttribute("href", "/atlas/#mechanisms");
  } finally {
    await context.close();
  }
});

test("breadcrumbs link to the relevant structure and reference indexes", async ({ page }) => {
  const rail = page.getByRole("navigation", { name: "Sheet position", exact: true });
  for (const [route, family] of [
    ["/structures/g-counter/", "Counters"],
    ["/structures/observed-remove-set/", "Sets"],
    ["/structures/register-collection/", "Registers"],
    ["/structures/shared-directory/", "Maps"],
    ["/structures/shared-sequence/", "Sequences"],
    ["/structures/claims/", "Coordination"],
    ["/structures/json-ot/", "Transforms"],
  ] as const) {
    await page.goto(route);
    await expect(rail.getByRole("link", { name: "Structures" })).toHaveAttribute("href", "/structures/");
    await expect(rail.getByRole("link", { name: family })).toHaveAttribute(
      "href", `/structures/${family.toLowerCase()}/`,
    );
    await expect(rail.locator('[aria-current="page"]')).toHaveCount(1);
  }
  await page.goto("/atlas/multi-value-registers/");
  await expect(rail.getByRole("link", { name: "Structures" })).toHaveAttribute("href", "/atlas/#structures");
  await expect(rail.getByRole("link", { name: "Reference atlas" })).toHaveAttribute("href", "/atlas/");
  await page.goto("/structures/coordination/");
  await expect(rail.getByRole("link", { name: "Structures" })).toHaveAttribute("href", "/structures/");
  await expect(rail.locator('[aria-current="page"]')).toHaveText("Coordination");
  await page.goto("/structures/shared-sequence/");
  await expect(rail.getByRole("listitem")).toHaveText([
    "Structures", "Sequences", "SharedSequence",
  ]);
  await expect(page).toHaveTitle("SharedSequence | Distributed Systems Atlas");
});

test("structure navigation follows the family and lesson order", async ({ page }) => {
  for (const group of structureGroups) {
    await page.goto(group.href);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(group.title);
    const nav = page.getByRole("navigation", { name: "Continue through structures" });
    for (const link of structureNextLinks(group.href)) {
      await expect(nav.getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
    }
    for (const [title, slug] of group.lessons) {
      const route = `/structures/${slug}/`;
      await page.goto(route);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      for (const link of structureNextLinks(route)) {
        await expect(page.getByRole("navigation", { name: "Continue through structures" })
          .getByRole("link", { name: link.label })).toHaveAttribute("href", link.href);
      }
    }
  }
});

test("atlas trail and paired lessons use the same destinations", async ({ page }) => {
  await page.goto("/atlas/");
  const trail = page.getByRole("navigation", { name: "Causal evidence trail" });
  await expect(trail.getByRole("listitem")).toHaveText(firstTrail.map((step) => step.title));
  for (const step of firstTrail) {
    await expect(trail.getByRole("link", { name: step.title }))
      .toHaveAttribute("href", `/atlas/${step.id}/`);
  }
  for (const [slug, pair] of Object.entries(pairedSheets)) {
    await page.goto(`/structures/${slug}/`);
    await expect(page.getByRole("link", { name: `Open the in-depth ${pair.lesson} sheet and lab` }))
      .toHaveAttribute("href", `/atlas/${pair.sheet}/`);
    await page.goto(`/atlas/${pair.sheet}/`);
    await expect(page.getByRole("link", { name: `Open the ${pair.lesson} lesson and simulation` }))
      .toHaveAttribute("href", `/structures/${slug}/`);
  }
});

test("the model guide uses the site as a description, not a product name", async ({ page }) => {
  await page.goto("/structures/models/");
  await expect(page.locator("main").first()).toContainText("The lessons cover three approaches");
  await expect(page.getByRole("heading", { name: "Structure lessons" })).toHaveCount(3);
  await expect(page.locator("main").first()).not.toContainText(/\bAtlas\b/);
});

test("the observation rail shell links public reference pages", async ({ page }) => {
  await page.goto("/");
  const footer = page.getByRole("contentinfo");
  await expect(footer).toContainText("A place to study what replicas know.");
  await expect(footer.getByRole("link", { name: "Glossary", exact: true })).toHaveAttribute("href", "/glossary/");
  await expect(footer.getByRole("link", { name: "Bibliography", exact: true })).toHaveAttribute("href", "/bibliography/");
  const source = footer.getByText("Source", { exact: true }).locator("..");
  await expect(source).toContainText("Planned");
  await expect(source.locator("a, button, [tabindex]")).toHaveCount(0);
  await expect(footer.getByRole("navigation", { name: "Browse all pages" })).toBeVisible();
});

test("footer navigation links to every published page without JavaScript", async ({ browser }) => {
  const pages = readdirSync(new URL("../src/pages/", import.meta.url), { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".astro") && !file.includes("["))
    .map((file) => `/${file.replace(/index\.astro$/, "").replace(/\.astro$/, "")}`.replace(/\/?$/, "/"));
  const lessons = remainingStructures.map(({ id }) => `/structures/${id}/`);
  const sheets = readdirSync(new URL("../src/content/sheets/", import.meta.url))
    .filter((file) => file.endsWith(".mdx") &&
      /^status: published$/m.test(readFileSync(new URL(`../src/content/sheets/${file}`, import.meta.url), "utf8")))
    .map((file) => `/atlas/${file.replace(/\.mdx$/, "")}/`);
  const expected = [...pages, ...lessons, ...sheets].sort();
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const width of [320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto("/");
      const nav = page.getByRole("navigation", { name: "Browse all pages" });
      await expect(nav).toBeVisible();
      const hrefs = await nav.getByRole("link").evaluateAll((links) =>
        links.map((link) => link.getAttribute("href"))
      );
      expect(hrefs.sort()).toEqual(expected);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
    await page.goto("/atlas/dots-and-causal-context/");
    await expect(page.getByRole("navigation", { name: "Browse all pages" }).getByRole("link"))
      .toHaveCount(expected.length);
  } finally {
    await context.close();
  }
});

test("generated glossary and bibliography expose published metadata", async ({ page }) => {
  await page.goto("/glossary/");
  await expect(page).toHaveTitle("Glossary | Distributed Systems Atlas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Glossary");
  await expect(page.locator("#dot")).toContainText("A unique event identifier");
  await expect(page.locator("#causal-context")).toContainText("A compact record");
  await expect(page.locator("#replica")).toContainText("A local copy of shared data");
  await expect(page.locator("#eventual-consistency")).toContainText(
    "Each replica has only the updates it has received",
  );
  await expect(page.locator("#g-counter")).toContainText(
    "gives each replica its own nondecreasing component",
  );
  await expect(page.locator("#pn-counter")).toContainText(
    "stores increases and decreases in separate grow-only components",
  );
  await expect(page.locator("#twopset")).toContainText(
    "A two-phase replicated set composed of two GSets",
  );
  await expect(page.locator("#tombstone")).toContainText(
    "Retained removal metadata",
  );
  await expect(page.locator("#sequencer")).toContainText(
    "assigns ordered sequence numbers",
  );
  await expect(page.locator("#sharedcounter")).toContainText(
    "applies signed delta operations",
  );
  await expect(page.locator("#sluice")).toContainText(
    "Watershed's in-memory server for one collaborative document",
  );

  await page.goto("/bibliography/");
  await expect(page).toHaveTitle("Bibliography | Distributed Systems Atlas");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bibliography");
  await expect(page.locator("#riak-dotted-version-vectors").getByRole("link"))
    .toHaveAttribute("href", "https://riak.com/posts/technical/vector-clocks-revisited-part-2-dotted-version-vectors/");
});

test("readers can follow all seven trail steps without JavaScript", async ({ browser }) => {
  test.setTimeout(90_000);
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/");
    await page.getByText("See the seven-sheet causal evidence trail").click();
    await page.locator('a[href="/atlas/multi-value-registers/"]').first().click();
    const titles = ["Multi-value registers", "Observed-remove sets", "Dots and causal context",
      "Local history", "Partial order", "Lamport clocks", "Vector clocks"];
    for (const [index, title] of titles.entries()) {
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(title);
      await expect(page.getByRole("navigation", { name: "Sheet position", exact: true }))
        .toContainText(`Trail ${index + 1} of 7`);
      const next = page.getByRole("navigation", { name: "Next in the structure-first trail", exact: true });
      if (index < titles.length - 1) await next.getByRole("link").click();
      else await expect(next).toHaveCount(0);
    }
  } finally {
    await context.close();
  }
});

test("sheet terms and references link to generated entries", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  await expect(page.getByRole("complementary", { name: "Terms on this sheet" })
    .getByRole("link", { name: "dot", exact: true })).toHaveAttribute("href", "/glossary/#dot");
  await expect(page.locator(".sheet-term-note").first().locator("a"))
    .toHaveAttribute("href", "/glossary/#dot");
  await expect(page.getByRole("region", { name: "References", exact: true })
    .getByRole("link", { name: "Dotted Version Vectors", exact: true }))
    .toHaveAttribute("href", "/bibliography/#riak-dotted-version-vectors");
});

test("the Dots sheet moves from identity to observed removal", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");

  const articleHeadings = page.locator(".sheet-body h2:not(causal-lab h2)");
  await expect(articleHeadings).toHaveText([
    "One event needs one name",
    "A dot is identity, not a timestamp",
    "Context records what a replica has observed",
    "Compare what each station knows",
    "Remove only what you saw",
    "Break it: discard the context",
    "What causal metadata costs",
    "Field notes",
  ]);
});

test("Dots sheet figures explain identity and vector evidence without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/atlas/dots-and-causal-context/");
    const dots = page.getByRole("figure", { name: "Dot identity", exact: true });
    await expect(dots).toBeVisible();
    await expect(dots.getByTestId("station-mark-a")).toBeVisible();
    await expect(dots.getByTestId("station-mark-b")).toBeVisible();
    await expect(dots).toContainText("(A, 1)");
    await expect(dots).toContainText("(B, 1)");
    await expect(dots).toContainText("The replica ID makes equal counter values distinct");
    const vectors = page.getByRole("figure", { name: "Version vector comparison", exact: true });
    await expect(vectors.locator("tbody tr")).toHaveText([
      "A1=1", "B0<1",
    ]);
    await expect(vectors).toContainText("A is before B");
    await expect(vectors).toContainText("A component: 1 equals 1; B component: 0 is less than 1.");
    const comparison = page.getByRole("figure", { name: "Incorrect removal rules", exact: true });
    await expect(comparison.getByRole("columnheader")).toHaveText([
      "Incorrect: delete by value", "Incorrect: keep every add forever",
    ]);
    await expect(comparison).toContainText("Remove beacon at A");
    await expect(comparison).toContainText("Add beacon at B");
    await expect(comparison).toContainText("B:1");
    await expect(comparison).toContainText("A:1");
    const outsideNotes = await page.locator(".sheet-body").evaluate((body) => {
      const copy = body.cloneNode(true) as HTMLElement;
      copy.querySelector(".sheet-field-notes")?.remove();
      return copy.textContent;
    });
    expect(outsideNotes).not.toContain("Watershed");
    const notes = page.locator(".sheet-field-notes");
    await expect(notes).toContainText("Watershed");
    await expect(notes.getByRole("link", { name: "Watershed", exact: true }))
      .toHaveAttribute("href", "https://github.com/tylerbutler/watershed");
  } finally {
    await context.close();
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
      .toHaveAttribute("href", "/bibliography/#riak-dotted-version-vectors");
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

test("the landing page leads with data structures", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Start with a structure you already know",
  );
  await expect(
    page.getByRole("link", { name: "Start with counters", exact: true }),
  ).toHaveAttribute("href", "/structures/counters/");
  await expect(page.getByRole("link", {
    name: "Open the reference atlas",
    exact: true,
  })).toHaveAttribute("href", "/atlas/");
  await expect(page.locator("main").getByRole("heading", { level: 2 })).toHaveText([
    "Counters",
    "Learn the behavior before the bookkeeping",
    "Go deeper when a merge rule raises a question",
    "Open the machinery when you need it",
  ]);
  const disclosure = page.getByText("See the seven-sheet causal evidence trail", { exact: true });
  await disclosure.click();
  const trail = page.getByRole("list", { name: "Causal evidence trail" });
  await expect(trail.getByRole("listitem")).toHaveText([
    "Multi-value registers",
    "Observed-remove sets",
    "Dots and causal context",
    "Local history",
    "Partial order",
    "Lamport clocks",
    "Vector clocks",
  ]);
  await expect(trail.getByRole("link")).toHaveCount(7);
});

test("the counter family page links each counter lesson", async ({ page }) => {
  await page.goto("/structures/counters/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Counters");
  await expect(page.getByRole("region", { name: "G-counter" })).toContainText(
    "Keep each person's highest count",
  );
  await expect(page.getByRole("region", { name: "PN-counter" })).toContainText(
    "Increment and decrement",
  );
  await expect(page.getByRole("link", { name: "Read the G-counter lesson" }))
    .toHaveAttribute("href", "/structures/g-counter/");
  await expect(page.getByRole("link", { name: "Read the PN-counter lesson" }))
    .toHaveAttribute("href", "/structures/pn-counter/");
});

test("the sets family compares its three removal rules", async ({ page }) => {
  await page.goto("/structures/sets/");

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Sets");
  await expect(page.getByRole("region", { name: "GSet" })).toContainText("Keep every listed item");
  await expect(page.getByRole("region", { name: "TwoPSet" }))
    .toContainText("permanent removals");
  await expect(page.getByRole("region", { name: "Observed-remove set" }))
    .toContainText("Keep additions that were not removed");
  await expect(page.getByRole("table", { name: "Set comparison" })
    .locator("tbody th, tbody td")).toHaveText([
    "No item removal", "GSet", "Remember each item",
    "Removal is permanent", "TwoPSet", "Remember every removed item",
    "Items can return", "Observed-remove set", "Remember each addition and removal",
  ]);
  await expect(page.getByRole("link", {
    name: "Open the observed-remove set lesson",
  })).toHaveAttribute("href", "/structures/observed-remove-set/");
  await expect(page.getByRole("link", { name: "Open the GSet lesson" }))
    .toHaveAttribute("href", "/structures/g-set/");
  await expect(page.getByRole("link", { name: "Open the TwoPSet lesson" }))
    .toHaveAttribute("href", "/structures/two-p-set/");
});

test("the structures index and landing route readers through published families", async ({ page }) => {
  await page.goto("/structures/");
  await expect(page.getByRole("link", { name: "Compare CRDT, DDS, and OT structures" }))
    .toHaveAttribute("href", "/structures/models/");
  const familyLinks = page.getByRole("list", { name: "Structure lessons" }).getByRole("link");
  await expect(familyLinks).toHaveCount(7);
  await expect(familyLinks.filter({ has: page.getByRole("heading", { name: "Registers", exact: true }) }))
    .toHaveAttribute("href", "/structures/registers/");
  await expect(familyLinks.filter({ has: page.getByRole("heading", { name: "Maps", exact: true }) }))
    .toHaveAttribute("href", "/structures/maps/");
  for (const link of await familyLinks.all()) {
    expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Open the reference atlas" }))
    .toHaveAttribute("href", "/atlas/");
});

test("the model comparison explains tags and links structure pages", async ({ page }) => {
  await page.goto("/structures/models/");

  await expect(page.getByRole("heading", { level: 1 }))
    .toHaveText("Three ways shared data can agree");
  const comparison = page.getByRole("table");
  await expect(comparison).toContainText("Apply one numbered list");
  await expect(comparison).toContainText("Combine changes with a safe rule");
  await expect(comparison).toContainText("Rewrite changes before applying them");
  await expect(comparison).toContainText("Offline work and unreliable delivery");

  await page.goto("/structures/g-counter/");
  await expect(page.getByRole("link", { name: "Learn what CRDT means" }))
    .toHaveAttribute("href", "/structures/models/#crdt");
});

test("the G-counter lesson exposes a direct reading path", async ({ page }) => {
  await page.goto("/structures/g-counter/");
  const lessonMap = page.getByRole("navigation", { name: "G-counter lesson map" });
  await expect(lessonMap.getByRole("link")).toHaveText([
    "Understand the notebooks",
    "See crossing notes",
    "Try the sandbox",
  ]);
  await expect(lessonMap.getByRole("link", { name: "Try the sandbox" }))
    .toHaveAttribute("href", "#gcounter-demo-title");
  await expect(page.getByRole("heading", { name: "Record sightings on three hikes" }))
    .toBeVisible();
});

test("demo operation logs number newest entries from the top", async ({ page }) => {
  for (const [path, label] of [
    ["/structures/g-counter/", "Checkpoint note log"],
    ["/structures/pn-counter/", "Correction note log"],
    ["/structures/shared-counter/", "Sequenced operation log"],
    ["/structures/g-set/", "Set operation log"],
    ["/structures/lww-register/", "Register write log"],
    ["/structures/shared-map/", "Map operation log"],
  ]) {
    await page.goto(path);
    await expect(page.getByRole("list", { name: label })).toHaveAttribute("reversed", "");
  }
});

test("landing page works without client JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Start with a structure you already know",
  );
  await expect(page.getByRole("link", { name: "Start with counters", exact: true }))
    .toBeVisible();
  await expect(page.getByRole("link", { name: "Open the reference atlas" })).toBeVisible();
  await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
  await expect(page.getByRole("contentinfo")).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await page.keyboard.press("Tab");
  const primary = page.locator("main").getByRole("link", { name: "Counters", exact: true });
  await expect(primary).toBeFocused();
  await expect(primary).toHaveCSS("outline-style", "solid");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/structures\/counters\/$/);
  await page.goto("/");
  await page.getByRole("link", { name: "Start with counters", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Counters", level: 1 })).toBeVisible();
  await context.close();
});

test("atlas exposes four territories and seven published sheets without dead links", async ({ page, request }) => {
  await page.goto("/atlas/");
  for (const name of ["Mechanisms", "Structures", "Failure modes", "Systems"]) {
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  }
  for (const title of trailTitles) {
    await expect(page.getByTestId("territory-chart").getByRole("link", { name: title, exact: true })).toBeVisible();
  }
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveCount(4);
  await expect(nav.getByRole("link", { name: "Structures", exact: true })).toHaveAttribute(
    "href",
    "/structures/",
  );
  await expect(nav.getByRole("link", { name: "Reference atlas", exact: true })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByText("Trails", { exact: true })).toHaveCount(0);
  expect((await request.get("/trails/")).status()).toBe(404);
  expect((await request.get("/glossary/")).status()).toBe(200);
  expect((await request.get("/bibliography/")).status()).toBe(200);
  for (const id of ["local-history", "partial-order", "lamport-clocks", "vector-clocks", "multi-value-registers", "observed-remove-sets"]) {
    expect((await request.get(`/atlas/${id}/`)).status()).toBe(200);
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
      "Structures", "Mechanisms", "Failure modes", "Systems",
    ]);
    const mechanisms = page.getByTestId("territory-mechanisms");
    await expect(mechanisms.getByRole("heading", { level: 3 })).toHaveText([
      "Dots and causal context", "Local history", "Partial order", "Lamport clocks", "Vector clocks",
    ]);
    await expect(page.getByTestId("territory-structures").getByRole("heading", { level: 3 }))
      .toHaveText(["Multi-value registers", "Observed-remove sets"]);
    await expect(chart.getByRole("listitem")).toHaveCount(7);
    for (const title of trailTitles) {
      const station = chart.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
      await expect(station.getByRole("link", { name: title, exact: true })).toBeVisible();
    }
    const trail = page.getByRole("navigation", { name: "Causal evidence trail", exact: true });
    await expect(trail).toContainText("Begin with two structures, then inspect the causal evidence behind them.");
    await expect(trail.getByRole("link", { name: "Browse topics by territory" }))
      .toHaveAttribute("href", "#territories");
    await expect(chart.getByRole("link")).toHaveCount(7);
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
    root = await realpath(await mkdtemp(path.join(tmpdir(), "atlas-shell-")));
    await cp("src", path.join(root, "src"), { recursive: true });
    await cp("art", path.join(root, "art"), { recursive: true });
    await cp("public", path.join(root, "public"), { recursive: true });
    const catalogPath = path.join(root, "art/lesson-illustrations.json");
    const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
    catalog.illustrations.push({
      id: "atlas-replicated-log",
      asset: "/illustrations/lessons/atlas-local-history.svg",
      alt: "Fixture illustration for the replicated log.",
    }, {
      id: "atlas-scenario-reference",
      asset: "/illustrations/lessons/atlas-local-history.svg",
      alt: "Fixture illustration for the scenario reference.",
    });
    await writeFile(catalogPath, JSON.stringify(catalog));
    const layoutPath = path.join(root, "src/layouts/BaseLayout.astro");
    await writeFile(layoutPath, (await readFile(layoutPath, "utf8"))
      .replace('import { Script } from "astro-tinylytics";\n', "")
      .replace(/^    <Script embedCode="[^"]+" min hits \/>$/m, ""));
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
    for (const file of await readdir(path.join(root, "src/content/sheets"))) {
      if (/\.mdx?$/.test(file)) await rm(path.join(root, "src/content/sheets", file));
    }
    const sheets = [
      {
        id: "dots-and-causal-context",
        title: "Dots and causal context",
        territory: "mechanisms",
        status: "published",
        requires: ["local-history", { id: "failure-detectors", planned: true }],
        related: ["replicated-log", { id: "failure-detectors", planned: true }],
        terms: [{ term: "dot", definition: "A unique event identifier." }],
        references: [{ key: "paper", title: "A paper", url: "https://example.com/paper" }],
      },
      { id: "local-history", title: "Local history", territory: "mechanisms", status: "published" },
      {
        id: "failure-detectors",
        title: "Failure detectors",
        territory: "failures",
        status: "planned",
        terms: [{ term: "unpublished", definition: "Not public yet." }],
        references: [{ key: "unpublished", title: "Not public yet", url: "https://example.com/unpublished" }],
      },
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

  test("Dots sheet vector figures derive all four relations from their props", async ({ page }) => {
    test.setTimeout(90_000);
    await writeFile(path.join(root, "src/pages/vector-figures.astro"), `---
import VectorComparison from "../components/VectorComparison.astro";
---
<VectorComparison left={{ A: 1 }} right={{ A: 1, B: 1 }} />
<VectorComparison left={{ A: 1, B: 1 }} right={{ A: 1 }} />
<VectorComparison left={{ A: 1 }} right={{ B: 1 }} />
<VectorComparison left={{}} right={{ A: 0 }} />
`);
    const result = await buildFixture(root);
    expect(result.code, result.output).toBe(0);
    await page.setContent(await readFile(path.join(root, "dist/vector-figures/index.html"), "utf8"));
    const figures = page.getByRole("figure", { name: "Version vector comparison", exact: true });
    for (const [index, relation, rows, evidence] of [
      [0, "A is before B", ["A1=1", "B0<1"], "A component: 1 equals 1; B component: 0 is less than 1."],
      [1, "A is after B", ["A1=1", "B1>0"], "A component: 1 equals 1; B component: 1 is greater than 0."],
      [2, "A and B are concurrent", ["A1>0", "B0<1"], "A component: 1 is greater than 0; B component: 0 is less than 1."],
      [3, "A and B are equal", ["A0=0"], "A component: 0 equals 0."],
    ] as const) {
      await expect(figures.nth(index)).toContainText(relation);
      await expect(figures.nth(index).locator("tbody tr")).toHaveText([...rows]);
      await expect(figures.nth(index)).toContainText(evidence);
    }
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
    await expect(page.getByRole("complementary", { name: "Terms on this sheet" })
      .getByRole("link", { name: "dot", exact: true })).toHaveAttribute("href", "/glossary/#dot");
    await expect(page.getByRole("heading", { name: "Fixture article" })).toBeVisible();
    const supportingIdeas = page.getByRole("navigation", { name: "Background, if needed" });
    await expect(supportingIdeas.getByRole("link", { name: "Local history" })).toHaveAttribute("href", "/atlas/local-history/");
    await expect(supportingIdeas).toContainText("Failure detectors");
    await expect(supportingIdeas).toContainText("Planned");
    await expect(supportingIdeas.getByRole("link")).toHaveCount(1);
    const related = page.getByRole("navigation", { name: "Related sheets" });
    await expect(related.getByRole("link", { name: "Replicated log" })).toHaveAttribute("href", "/atlas/replicated-log/");
    await expect(related.getByRole("link")).toHaveCount(1);
    const next = page.getByRole("navigation", { name: "Next in the structure-first trail" });
    await expect(next).toContainText("Local history");
    await expect(next.getByRole("link")).toHaveAttribute("href", "/atlas/local-history/");

    await page.setContent(await readFile(path.join(root, "dist/atlas/local-history/index.html"), "utf8"));
    const rail = page.getByRole("navigation", { name: "Sheet position", exact: true });
    await expect(rail.getByRole("listitem")).toHaveText([
      "Reference atlas", "Mechanisms", "Local history", "Trail 4 of 7",
    ]);
    await expect(page.getByText("No supporting sheet required", { exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Next in the structure-first trail" })).toContainText("Partial order");
    await page.setContent(await readFile(path.join(root, "dist/atlas/replicated-log/index.html"), "utf8"));
    await expect(page.locator(".sheet-header")).toContainText("3 min read");
    await expect(rail.getByRole("listitem")).toHaveText(["Reference atlas", "Systems", "Replicated log"]);
    await expect(page.getByRole("navigation", { name: "Next in the structure-first trail" })).toHaveCount(0);

    const glossary = await readFile(path.join(root, "dist/glossary/index.html"), "utf8");
    expect(glossary).toContain("A unique event identifier.");
    expect(glossary).not.toContain("Not public yet.");
    const bibliography = await readFile(path.join(root, "dist/bibliography/index.html"), "utf8");
    expect(bibliography).toContain("https://example.com/paper");
    expect(bibliography).not.toContain("https://example.com/unpublished");
  });

  test("atlas rejects a nonexistent declared scenario without rendering a lab", async () => {
    test.setTimeout(90_000);
    const fixture = path.join(root, "src/content/sheets/scenario-reference.md");
    const content = `---
title: Scenario reference
summary: A scenario reference without a rendered lab.
territory: mechanisms
status: published
scenarios: [dots-concurrent-add-remove, missing-final-review-scenario]
---
`;
    try {
      await writeFile(fixture, content);
      const invalid = await buildFixture(root);
      expect(invalid.code, invalid.output).not.toBe(0);
      expect(invalid.output).toContain("Invalid atlas content graph:");
      expect(invalid.output).toContain("scenario-reference.scenarios: missing scenario missing-final-review-scenario");
      await writeFile(fixture, content.replace(", missing-final-review-scenario", ""));
      const valid = await buildFixture(root);
      expect(valid.code, valid.output).toBe(0);
    } finally {
      await rm(fixture, { force: true });
    }
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
scenarios: [missing-scenario]
---
`);
    const result = await buildFixture(root);
    expect(result.code).not.toBe(0);
    expect(result.output).toContain("Invalid atlas content graph:");
    expect(result.output).toContain("broken.requires: missing sheet missing-prerequisite");
    expect(result.output).toContain("broken.related: missing sheet missing-related");
    expect(result.output).toContain("broken.scenarios: missing scenario missing-scenario");
  });

  test("content loading rejects files with colliding generated sheet IDs", async () => {
    test.setTimeout(90_000);
    const upper = path.join(root, "src/content/sheets/Collision.md");
    const lower = path.join(root, "src/content/sheets/collision.md");
    const content = `---
slug: collision
title: Collision
summary: A generated ID collision fixture.
territory: mechanisms
status: planned
---
`;
    try {
      await Promise.all([
        writeFile(upper, content),
        writeFile(lower, content),
      ]);
      const result = await buildFixture(root);
      expect(result.code).not.toBe(0);
      expect(result.output).toContain('Duplicate sheet ID "collision"');
      expect(result.output).toContain("Collision.md");
      expect(result.output).toContain("collision.md");
    } finally {
      await Promise.all([
        rm(upper, { force: true }),
        rm(lower, { force: true }),
      ]);
    }
  });
});
