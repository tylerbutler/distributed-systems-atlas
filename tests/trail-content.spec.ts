import { expect, test, type Locator } from "@playwright/test";
import { scenarioById, scenarioTrace } from "../src/lib/lab/scenarios";
import { firstTrail } from "../src/lib/atlas/trail";

const lessons = [
  {
    id: "local-history", title: "Local history", scenario: "local-history-message-observation",
    outcome: "Delivery is not global knowledge",
    headings: ["A message can arrive with old news", "Keep execution and observation separate",
      "Hold the message while A changes", "Account for the missing event",
      "Break it: read the sender at delivery", "The cost of an explicit history", "Field notes"],
    figure: "Final local and observed histories", evidence: ["a1, a2", "a1, b1"],
    initial: ["No local events", "No events observed"], replicas: ["A", "B"],
    terms: ["local history", "observation"], reference: "lamport-time-clocks",
  },
  {
    id: "partial-order", title: "Partial order", scenario: "partial-order-comparison",
    outcome: "Paths define the partial order",
    headings: ["Three stations do not make one log", "Read edges as dependencies",
      "Compare the connected and disconnected pairs", "A missing path is a result",
      "Break it: sort the buttons", "What a path check assumes", "Field notes"],
    figure: "Partial-order comparison results", evidence: ["before", "concurrent", "equal"],
    initial: ["No local events", "No events observed"], replicas: ["A", "B", "C"],
    terms: ["happens-before", "concurrency"], reference: "lamport-time-clocks",
  },
  {
    id: "lamport-clocks", title: "Lamport clocks", scenario: "lamport-ordering-concurrency-limit",
    outcome: "Scalar order is not causality",
    headings: ["Put the send before the receive", "One counter advances at each event",
      "Record equal and unequal concurrent timestamps", "Separate the clock condition from its converse",
      "Break it: smaller means observed", "One counter with limited evidence", "Field notes"],
    figure: "Lamport reference timestamps", evidence: ["a2", "b2", "b1, a2"],
    initial: ["Scalar clock", "No local events"], replicas: ["A", "B"],
    terms: ["Lamport clock", "total order"], reference: "lamport-time-clocks",
  },
  {
    id: "vector-clocks", title: "Vector clocks", scenario: "vector-clock-comparisons",
    outcome: "Four vector relations",
    headings: ["One number loses the source of progress", "Compare down the component columns",
      "Exercise all four relations", "Track both the inputs and the station state",
      "Break it: compare only the largest counter", "A component for each process", "Field notes"],
    figure: "Four vector relations", evidence: ["before", "after", "equal", "concurrent"],
    initial: ["A:0, B:0", "2 components per clock"], replicas: ["A", "B"],
    terms: ["vector clock", "component-wise order"], reference: "mattern-virtual-time",
  },
  {
    id: "multi-value-registers", title: "Multi-value registers", scenario: "mv-register-concurrent-writes-observed-resolution",
    outcome: "An observed write replaces both siblings",
    headings: ["Two stations choose a signal color", "Keep a version beside each value",
      "Stop at the two-sibling checkpoint", "Agreement can contain a conflict",
      "Break it: keep only the last arrival", "What retained siblings cost", "Field notes"],
    figure: "Register sibling checkpoints", evidence: ["red and blue", "[A:2, B:1]"],
    initial: ["Empty register", "No register siblings", "A:0, B:0"], replicas: ["A", "B"],
    terms: ["multi-value register", "sibling"], reference: "shapiro-crdt-catalogue",
  },
  {
    id: "observed-remove-sets", title: "Observed-remove sets", scenario: "or-set-concurrent-add-remove-stale-replay",
    outcome: "The concurrent add survives stale replay",
    headings: ["A removed signal returns in an old message", "Retain the identity after membership changes",
      "Save a stale copy before removing", "Follow live and removed dots through delivery",
      "Break it: discard the tombstone", "Removal knowledge outlives membership", "Field notes"],
    figure: "Observed-remove tag checkpoints", evidence: ["B:2", "A:1", "Stale A:1 replayed"],
    initial: ["Empty set", "No removed dots", "A:0, B:0"], replicas: ["A", "B"],
    terms: ["observed-remove set", "tombstone", "add-wins"], reference: "bieniusa-optimized-set",
  },
] as const;

async function detail(replica: Locator, label: string, value: string) {
  await expect(replica.locator("dt").filter({ hasText: new RegExp(`^${label}$`) })
    .locator("+ dd")).toHaveText(value);
}

for (const lesson of [
  {
    route: "vector-clocks", scenario: "vector-clock-comparisons",
    deviation: ["Local event at B", "Compare [A:1, B:1] with [A:1, B:0]"],
  },
  {
    route: "multi-value-registers", scenario: "mv-register-concurrent-writes-observed-resolution",
    deviation: ["Write red at B", "Write blue at B"],
  },
]) {
  test(`${lesson.route}: a deviation requires reset before reference steps resume`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(`/atlas/${lesson.route}/`);
    const lab = page.getByTestId("causal-lab");
    const actions = scenarioById(lesson.scenario).actions!;
    const reference = lab.getByRole("button", { name: /^Next: / });
    await expect(reference).toBeEnabled();
    for (const name of lesson.deviation) {
      await lab.getByRole("button", { name, exact: true }).click();
      await expect(lab.getByRole("alert")).toBeHidden();
      await expect(reference).toHaveCount(0);
    }
    if (lesson.route === "multi-value-registers") {
      await expect(lab.getByRole("button", { name: /^Deliver / })).toHaveText([
        "Deliver m1 from B to A", "Deliver m2 from B to A",
      ]);
    }
    await lab.getByRole("button", { name: "Frame 0: initial", exact: true }).click();
    await expect(reference).toHaveCount(0);
    await lab.getByRole("button", { name: /^Frame 2:/ }).click();
    await expect(reference).toHaveCount(0);
    await lab.getByRole("button", { name: "Reset lab", exact: true }).click();
    for (const _action of actions) {
      const next = lab.getByRole("button", { name: /^Next: / });
      await expect(next).toBeEnabled();
      await next.click();
      await expect(lab.getByRole("alert")).toBeHidden();
    }
    await expect(reference).toHaveCount(0);
  });
}

test("a register write made before observing blue preserves that concurrent sibling", async ({ page }) => {
  await page.goto("/atlas/multi-value-registers/");
  const lab = page.getByTestId("causal-lab");
  for (const name of ["Write red at A", "Write blue at B", "Write green at A",
    "Deliver m3 from A to B", "Deliver m2 from B to A", "Deliver m1 from A to B"]) {
    await lab.getByRole("button", { name, exact: true }).click();
  }
  for (const id of ["A", "B"]) {
    const replica = lab.getByRole("region", { name: `Replica ${id}`, exact: true });
    await detail(replica, "Register siblings", "green [A:2, B:0]; blue [A:0, B:1]");
  }
  await expect(lab.getByRole("region", { name: "Observation complete" })).toHaveCount(0);
  await expect(lab.getByRole("region", { name: "Invariant checks" })).toContainText("Converged: yes");
});

for (const lesson of lessons) {
  test(`${lesson.id}: content acceptance and useful initial state without JavaScript`, async ({ browser, page: livePage }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 } });
    try {
      const page = await context.newPage();
      expect((await page.goto(`/atlas/${lesson.id}/`))?.status()).toBe(200);
      await expect(page).toHaveTitle(`${lesson.title} | Distributed Systems Atlas`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(lesson.title);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /.+/);
      await expect(page.locator(".sheet-body h2:not(causal-lab h2)")).toHaveText([...lesson.headings]);
      await expect(page.locator(".sheet-opening")).toBeVisible();
      await expect(page.locator(".sheet-continuation")).toBeVisible();
      const figure = page.getByRole("figure", { name: lesson.figure, exact: true });
      for (const text of lesson.evidence) await expect(figure).toContainText(text);
      await expect(page.locator(".sheet-break")).toContainText(lesson.headings[4]);
      await expect(page.locator(".sheet-costs")).toContainText(lesson.headings[5]);
      await expect(page.locator(".sheet-field-notes pre")).toHaveCount(1);
      await expect(page.locator(".sheet-terms dt")).toHaveText([...lesson.terms]);
      await expect(page.locator(".sheet-references a").first())
        .toHaveAttribute("href", `/bibliography/#${lesson.reference}`);
      if (["local-history", "dots-and-causal-context"].includes(lesson.id)) {
        await expect(page.locator(".sheet-header")).toContainText("No supporting sheet required");
      } else {
        expect(await page.getByRole("navigation", { name: "Ideas used on this sheet", exact: true })
          .getByRole("link").count()).toBeGreaterThan(0);
      }
      expect(await page.getByRole("navigation", { name: "Related sheets", exact: true })
        .getByRole("link").count()).toBeGreaterThan(0);
      const next = firstTrail[firstTrail.findIndex(({ id }) => id === lesson.id) + 1];
      if (next) {
        await expect(page.getByRole("navigation", { name: "Next in the structure-first trail", exact: true }).getByRole("link"))
          .toHaveAttribute("href", `/atlas/${next.id}/`);
      } else {
        await expect(page.getByRole("navigation", { name: "Next in the structure-first trail", exact: true })).toHaveCount(0);
      }
      const destinations = await page.locator("article a[href^='/']").evaluateAll((links) =>
        [...new Set(links.map((link) => link.getAttribute("href")!))]);
      for (const href of destinations) {
        const [pathname, fragment] = href.split("#");
        const response = await context.request.get(new URL(pathname, page.url()).href);
        expect(response.status(), href).toBe(200);
        if (fragment) expect(await response.text(), href).toContain(`id="${fragment}"`);
      }
      const words = await page.locator(".sheet-body").evaluate((body) => {
        const copy = body.cloneNode(true) as HTMLElement;
        copy.querySelectorAll("causal-lab, pre").forEach((element) => element.remove());
        return copy.textContent?.match(/\b[\w]+(?:['’-][\w]+)*\b/g)?.length ?? 0;
      });
      expect(words).toBeGreaterThanOrEqual(1000);
      expect(words).toBeLessThanOrEqual(1900);
      const lab = page.getByTestId("causal-lab");
      await expect(lab).toHaveAttribute("scenario", lesson.scenario);
      for (const id of lesson.replicas) {
        const replica = lab.getByRole("region", { name: `Replica ${id}`, exact: true });
        for (const text of lesson.initial) await expect(replica).toContainText(text);
        if (lesson.id === "lamport-clocks") await detail(replica, "Scalar clock", "0");
      }
      await expect(lab).toContainText("No queued messages");
      await expect(lab.getByText(/controls need JavaScript/)).toBeVisible();
      await expect(lab.getByRole("button")).toHaveCount(0);
      await expect(lab.getByRole("region", { name: "Observation complete" })).toHaveCount(0);
      await livePage.goto(`/atlas/${lesson.id}/`);
      const live = livePage.getByTestId("causal-lab");
      await expect(live.getByRole("button", { name: "Reset lab", exact: true })).toBeVisible();
      for (const selector of ["h2", ".lab-replicas", ".lab-invariants", ".lab-explanation > p:last-child"]) {
        const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
        expect(normalize(await lab.locator(selector).innerText()))
          .toBe(normalize(await live.locator(selector).innerText()));
      }
      for (const notice of scenarioById(lesson.scenario).presentation.controls(
        scenarioTrace(lesson.scenario)[0],
        [scenarioTrace(lesson.scenario)[0]],
      ).filter((control) => control.kind === "notice")) {
        await expect(lab.locator(".lab-explanation")).toContainText(notice.text);
        await expect(live.getByRole("region", { name: "Lesson controls", exact: true })).toContainText(notice.text);
      }
      const contents = page.locator(".sheet-contents").first();
      await contents.locator("summary").click();
      await contents.getByRole("link", { name: "Field notes", exact: true }).click();
      await expect(page.getByRole("heading", { name: "Field notes", exact: true })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (lesson.id === "multi-value-registers" || lesson.id === "observed-remove-sets") {
        await expect(page.locator(".sheet-field-notes")).toContainText("4a8739323ee491f353fcaa8ccfb0488419c1cd43");
        await expect(page.locator(".sheet-field-notes")).toContainText("@atlas/toolkit");
        await expect(page.locator(".sheet-header")).not.toContainText("Watershed");
      }
    } finally {
      await context.close();
    }
  });

  for (const width of [390, 1440]) {
    test(`${lesson.id}: canonical lesson and checkpoints at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      expect((await page.goto(`/atlas/${lesson.id}/`))?.status()).toBe(200);
      const lab = page.getByTestId("causal-lab");
      const replica = (id: string) => lab.getByRole("region", { name: `Replica ${id}`, exact: true });
      await expect(lab.getByRole("button", { name: "Reset lab", exact: true })).toBeVisible();
      for (const id of lesson.replicas) {
        for (const text of lesson.initial) await expect(replica(id)).toContainText(text);
      }
      const actions = scenarioById(lesson.scenario).actions!;
      for (const [index] of actions.entries()) {
        const control = lab.getByRole("button", { name: /^Next: / });
        await control.focus();
        await expect(control).toHaveCSS("outline-style", "solid");
        await page.keyboard.press("Enter");
        await expect(lab.getByRole("alert")).toBeHidden();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (lesson.id === "local-history" && index === 2) {
          await expect(lab.getByRole("region", { name: "Queued messages" })).toContainText("a1");
          await expect(lab.getByRole("region", { name: "Queued messages" })).not.toContainText("a2");
        }
        if (lesson.id === "multi-value-registers" && index === 3) {
          for (const id of ["A", "B"]) {
            await detail(replica(id), "Register siblings", "red [A:1, B:0]; blue [A:0, B:1]");
            await detail(replica(id), "Causal context", "A:1, B:1");
          }
          await expect(lab.getByRole("region", { name: "Observation complete" })).toHaveCount(0);
        }
        if (lesson.id === "observed-remove-sets" && index === 6) {
          await detail(replica("A"), "Visible value", "Empty set");
          await detail(replica("B"), "Set membership", "beacon [A:1, B:2]");
          await expect(lab.locator(".lab-message")).toHaveCount(3);
          await expect(lab.getByRole("region", { name: "Observation complete" })).toHaveCount(0);
        }
        if (lesson.id === "observed-remove-sets" && index === 8) {
          for (const id of ["A", "B"]) await detail(replica(id), "Set membership", "beacon [B:2]");
          await expect(lab.locator(".lab-message")).toHaveCount(1);
          await expect(lab.getByRole("region", { name: "Observation complete" })).toHaveCount(0);
        }
      }
      await expect(lab.getByRole("region", { name: "Observation complete" })).toContainText(lesson.outcome);
      if (lesson.id === "local-history") {
        await detail(replica("A"), "Local history", "a1, a2");
        await detail(replica("B"), "Local history", "b1");
        await detail(replica("B"), "Observed events", "a1, b1");
      } else if (lesson.id === "partial-order") {
        const controls = lab.getByRole("region", { name: "Lesson controls" });
        for (const result of ["a1 / b1: before", "b1 / c1: concurrent", "c1 / c1: equal"]) {
          await expect(controls).toContainText(result);
        }
      } else if (lesson.id === "lamport-clocks") {
        await detail(replica("A"), "Scalar clock", "2");
        await detail(replica("B"), "Scalar clock", "3");
        await detail(replica("A"), "Local history", "a1@1, a2@2");
        await detail(replica("B"), "Local history", "b1@1, b2@3");
        await expect(lab.getByRole("region", { name: "Event comparison" })).toContainText("b1 / a2: concurrent");
        await expect(lab).toContainText("a1@1/A, b1@1/B, a2@2/A, b2@3/B");
      } else if (lesson.id === "vector-clocks") {
        for (const relation of ["before", "after", "equal", "concurrent"]) {
          await expect(lab.getByRole("region", { name: "Lesson controls" })).toContainText(`]: ${relation}`);
        }
        for (const id of ["A", "B"]) await detail(replica(id), "Clock", "A:0, B:0");
      } else if (lesson.id === "multi-value-registers") {
        for (const id of ["A", "B"]) {
          await detail(replica(id), "Register siblings", "green [A:2, B:1]");
          await detail(replica(id), "Causal context", "A:2, B:1");
        }
      } else {
        for (const id of ["A", "B"]) {
          await detail(replica(id), "Set membership", "beacon [B:2]");
          await detail(replica(id), "Removed dots", "beacon [A:1]");
          await detail(replica(id), "Causal context", "A:1, B:2");
        }
      }
      await expect(lab.locator(".lab-message")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width < 1024) await lab.locator(".lab-advanced > summary").click();
      await lab.getByRole("button", { name: "Frame 0: initial", exact: true }).click();
      await expect(lab.getByRole("region", { name: "Observation complete" })).toHaveCount(0);
      await lab.getByRole("button", { name: "Reset lab", exact: true }).click();
      await expect(lab.getByRole("button", { name: /^Next: / })).toBeEnabled();
      for (const id of lesson.replicas) {
        for (const text of lesson.initial) await expect(replica(id)).toContainText(text);
      }
    });
  }
}
