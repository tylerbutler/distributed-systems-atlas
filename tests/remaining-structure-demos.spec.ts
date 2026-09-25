import { expect, test } from "@playwright/test";

const examples = [
  ["shared-sequence", "SharedSequence", "Race the route insertions", ["Bridge", "Weir", "North gate"], ["Bridge", "Falls", "Marsh", "Weir", "North gate"]],
  ["shared-text", "SharedText", "Crowd an insert before “weir”", ["The weir is clear."], ["The still calm weir is clear."]],
  ["claims", "Claims", "Race the gate-key claims", ["gate-key: unclaimed"], ["gate-key: Alice"]],
  ["fifo-work-queue", "FifoWorkQueue", "Race to acquire the inspection", ["Queue: inspect bridge"], ["Alice owns inspect bridge", "Queue empty"]],
  ["task-manager", "TaskManager", "Queue the dispatcher volunteers", ["dispatcher: unassigned"], ["dispatcher: Alice", "waiting: Bob, Carol"]],
  ["pact-map", "PactMap", "Propose and sign off the closure", ["closure-target: absent"], ["closure-target: ridge-pass", "accepted by A, B, C"]],
  ["json-ot", "JsonOt", "Race the report edits", ["{}"], ['{"revision":1,"title":"field notes"}']],
  ["shared-rich-text", "SharedRichText", "Race formatting and insertion", ["Hello World"], ["Hello [bold] World ▲"]],
] as const;

const coordinationSequenceNumbers = {
  claims: 3,
  "fifo-work-queue": 3,
  "task-manager": 3,
  "pact-map": 4,
} as const;

for (const [slug, name, race, initial, final] of examples) {
  test(`${name} runs a three-client authored race`, async ({ page }) => {
    await page.goto(`/structures/${slug}/`);
    const demo = page.getByTestId(`${slug}-demo`);
    await expect(demo.locator("[data-client]")).toHaveCount(3);
    await expect(demo.locator(".remaining-local-record")).toHaveCount(3);
    await expect(demo.locator(".remaining-paper-note")).toHaveCount(3);
    await expect(demo).not.toHaveAttribute("data-final");
    await demo.locator("[data-transport-auto-deliver]").uncheck();
    await demo.getByRole("button", { name: race }).click();
    await expect(demo.locator("[data-state] li")).toHaveText(initial);
    await expect(demo.locator("[data-status]")).toContainText("queued");
    if (slug === "shared-text") {
      await expect(demo.locator("[data-pending]")).toHaveText("11 edits waiting");
      await expect(demo.locator("[data-note-log] li")).toHaveCount(11);
    }
    if (slug in coordinationSequenceNumbers) {
      const sequenceNumber = coordinationSequenceNumbers[
        slug as keyof typeof coordinationSequenceNumbers
      ];
      await expect(demo.getByRole("heading", { name: "Sequencer" })).toBeVisible();
      await expect(demo.locator("[data-sequence-number]")).toHaveText("SN 0");
      await expect(demo.locator("[data-pending]")).toHaveText(
        `${sequenceNumber} operations waiting`,
      );
      await expect(demo.locator("[data-note-log] li")).toHaveCount(sequenceNumber);
      await expect(demo.locator("[data-note-log] li").last()).toContainText("waiting");
    }
    await demo.locator("[data-transport-auto-deliver]").check();
    const displayed = slug === "shared-sequence"
      ? final.map((value) => value === "Falls" ? "FallsA:4" : value === "Marsh" ? "MarshB:4" : value)
      : [...final];
    await expect(demo.locator("[data-state] li")).toHaveText(displayed);
    if (slug === "shared-text") {
      await expect(demo.locator("[data-sequence-number]")).toHaveText("SN 11");
      await expect(demo).toHaveAttribute("data-kernel-sequence", "11");
      for (const editor of await demo.locator("[data-local-record]").all()) {
        await expect(editor).toHaveValue(displayed[0]);
      }
    } else if (slug in coordinationSequenceNumbers) {
      const sequenceNumber = coordinationSequenceNumbers[
        slug as keyof typeof coordinationSequenceNumbers
      ];
      await expect(demo.locator("[data-sequence-number]")).toHaveText(`SN ${sequenceNumber}`);
      await expect(demo).toHaveAttribute("data-kernel-sequence", String(sequenceNumber));
      await expect(demo.locator("[data-pending]")).toHaveText("0 operations waiting");
      await expect(demo.locator("[data-note-log] li").first()).toContainText("delivered");
      await expect(demo.locator("[data-pending-count]")).toHaveText([
        "0 pending",
        "0 pending",
        "0 pending",
      ]);
      await expect(demo.locator("[data-local-record]")).toHaveText([
        displayed.join(" · "),
        displayed.join(" · "),
        displayed.join(" · "),
      ]);
    } else {
      await expect(demo.locator("[data-local-record]")).toHaveText([
        displayed.join(" · "),
        displayed.join(" · "),
        displayed.join(" · "),
      ]);
    }
    if (slug === "shared-sequence") {
      await expect(demo.locator('[data-client="A"] .remaining-paper-note sup')).toHaveText("A:4");
      await expect(demo.locator('[data-client="B"] .remaining-paper-note sup')).toHaveText("B:4");
      await expect(demo.locator("[data-note-log] li")).toHaveText([
        "Bob: Insert Marsh before Weir — delivered",
        "Alice: Insert Falls before Weir — delivered",
      ]);
      await demo.locator("[data-transport-auto-deliver]").uncheck();
      const carol = demo.locator('[data-client="C"] [data-sequence-insert]');
      await carol.getByLabel("Trail stop name").selectOption("Ridge");
      await carol.getByRole("button", { name: "Insert trail stop" }).click();
      await expect(demo.locator('[data-client="C"] [data-local-record] sup')).toHaveText(["A:4", "B:4"]);
      await carol.getByLabel("Trail stop name").selectOption("Falls");
      await carol.getByRole("button", { name: "Insert trail stop" }).click();
      await expect(demo.locator('[data-client="C"] [data-local-record] sup')).toHaveText(["B:4"]);
    }
    await demo.getByRole("button", { name: "Reset" }).click();
    await expect(demo.locator("[data-state] li")).toHaveText(initial);
    if (slug === "shared-text") {
      for (const editor of await demo.locator("[data-local-record]").all()) {
        await expect(editor).toHaveValue(initial[0]);
      }
    } else {
      await expect(demo.locator("[data-local-record]")).toHaveText([
        initial.join(" · "),
        initial.join(" · "),
        initial.join(" · "),
      ]);
    }
  });
}

test("SharedText accepts typing while delivery is paused", async ({ page }) => {
  await page.goto("/structures/shared-text/");
  const demo = page.getByTestId("shared-text-demo");
  const editors = demo.locator("[data-text-editor]");
  await demo.locator("[data-transport-auto-deliver]").uncheck();
  await editors.nth(0).fill("The weir is cloudy.");
  await expect(editors.nth(0)).toHaveValue("The weir is cloudy.");
  await expect(editors.nth(1)).toHaveValue("The weir is clear.");
  await expect(demo.locator("[data-pending]")).toHaveText("5 edits waiting");
  await demo.locator("[data-transport-auto-deliver]").check();
  for (const editor of await editors.all()) {
    await expect(editor).toHaveValue("The weir is cloudy.");
  }
  await expect(demo.locator("[data-note-log] li").first()).toContainText("delivered");
});

test("SharedText converges overlapping edits to one word", async ({ page }) => {
  await page.goto("/structures/shared-text/");
  const demo = page.getByTestId("shared-text-demo");
  await demo.getByRole("button", { name: "Overlap edits to “weir”" }).click();
  await expect(demo.locator("[data-pending]")).toHaveText("0 edits waiting");
  for (const editor of await demo.locator("[data-text-editor]").all()) {
    await expect(editor).toHaveValue("The levee is clear.");
  }
  await expect(demo.locator("[data-note-log] li")).toHaveText([
    "SN 7 · Bob: Delete symbols 5–7 — delivered",
    "SN 6 · Alice: Insert “e” at symbol 8 — delivered",
    "SN 5 · Alice: Insert “e” at symbol 7 — delivered",
    "SN 4 · Alice: Insert “v” at symbol 6 — delivered",
    "SN 3 · Alice: Insert “e” at symbol 5 — delivered",
    "SN 2 · Alice: Insert “l” at symbol 4 — delivered",
    "SN 1 · Alice: Delete symbols 4–8 — delivered",
  ]);
});

test("SharedText explains why identity-based sequence deltas replace raw offsets", async ({ page }) => {
  await page.goto("/structures/shared-text/");
  const lesson = page.locator("article").first();
  await expect(page.getByRole("heading", { name: "A character offset is only local" })).toBeVisible();
  await expect(lesson).toContainText("the result depends on which message arrives first");
  await expect(page.getByRole("heading", { name: "SharedText uses the SharedSequence rule" })).toBeVisible();
  await expect(lesson).toContainText("It is the same sequence CRDT.");
  await expect(lesson).toContainText("the delta is the authoritative payload");
  await expect(lesson).toContainText("they do not run the author's old index against the current string");
  await expect(page.getByRole("heading", { name: "Alternative perspective" })).toBeVisible();
  await expect(lesson).toContainText("Values are not identities.");
  await expect(lesson).toContainText("t{id-3} t{id-4}");
  await expect(lesson).toContainText("equal values can still be different items");
  await expect(lesson.getByRole("link", { name: "graphemes" })).toHaveAttribute("href", "/glossary/#grapheme");
  await expect(lesson.getByRole("link", { name: "delta", exact: true }).first()).toHaveAttribute("href", "/glossary/#delta");
});

test("the naive SharedText counterexample diverges when raw offsets arrive in different orders", async ({ page }) => {
  await page.goto("/structures/shared-text/");
  const demo = page.getByTestId("naive-text-merge-demo");
  const values = demo.locator("[data-naive-value]");
  await expect(demo.locator("[data-naive-client]")).toHaveCount(3);
  await expect(demo.locator(".naive-operations")).toContainText("six operations");
  await expect(demo.locator(".naive-operations")).toContainText("s@4 · t@5 · i@6");
  await demo.getByRole("button", { name: "Make concurrent edits" }).click();
  await expect(values).toHaveText([
    "The still weir is clear.",
    "The calm weir is clear.",
    "The weir is clear.",
  ]);
  await demo.getByRole("button", { name: "Replay raw offsets" }).click();
  await expect(values).toHaveText([
    "The calm still weir is clear.",
    "The still calm weir is clear.",
    "The calm still weir is clear.",
  ]);
  await expect(demo.locator("[data-naive-status]")).toContainText("Diverged");
  await demo.getByRole("button", { name: "Reverse Carol's arrival order" }).click();
  await expect(values.nth(2)).toHaveText("The still calm weir is clear.");
  await expect(demo.locator("[data-naive-status]")).toContainText("only her delivery order changed");
});

test("remaining family pages link every dedicated lesson", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  for (const [family, names] of [
    ["sequences", ["SharedSequence", "SharedText"]],
    ["coordination", ["Claims", "FifoWorkQueue", "TaskManager", "PactMap"]],
    ["transforms", ["JsonOt", "SharedRichText"]],
  ] as const) {
    await page.goto(`/structures/${family}/`);
    await expect(page.locator("main")).toHaveCount(1);
    await expect(page.locator(".page-intro .territory-label")).toHaveText("Structure family");
    expect(await page.locator(".page-intro").evaluate((element) => element.getBoundingClientRect().width))
      .toBeLessThanOrEqual(710);
    await expect(page.locator(".structure-family > section:has(.structure-link)")).toHaveCount(names.length);
    for (const name of names) {
      await expect(page.getByRole("link", { name: `Open the ${name} lesson` })).toBeVisible();
    }
  }
});

test("Coordination introduces the shared DDS sequencer model", async ({ page }) => {
  await page.goto("/structures/coordination/");
  const article = page.locator("article").first();
  await expect(article).toContainText("Every structure in this family is a distributed data structure.");
  await expect(page.getByRole("heading", { name: "One shared order before one decision" })).toBeVisible();
  await expect(article).toContainText("All four coordination structures rely on a sequencer.");
  await expect(article).toContainText("it cannot finalize a coordinated result while the sequencer is unavailable");
  await expect(article.getByRole("link", { name: "distributed data structure" })).toHaveAttribute("href", "/glossary/#dds");
  await expect(article.getByRole("link", { name: "sequencer", exact: true }).first()).toHaveAttribute("href", "/glossary/#sequencer");
});

test("Claims explains its write-once shared-map mechanics", async ({ page }) => {
  await page.goto("/structures/claims/");
  const lesson = page.locator("article").first();
  await expect(page.getByRole("heading", { name: "Translate the story into a map" })).toBeVisible();
  await expect(lesson).toContainText("SharedMap the closest structure by shape");
  await expect(lesson).toContainText("there is no release, delete, or reset operation");
  await expect(lesson).toContainText("first operation accepted by the sequencer");
  await expect(lesson.getByRole("link", { name: "first-writer-wins" }).first()).toHaveAttribute(
    "href",
    "/glossary/#first-writer-wins",
  );
  const comparison = page.getByRole("table", { name: "Claims and SharedMap mechanics" });
  await expect(comparison).toContainText("First numbered claim");
  await expect(comparison).toContainText("Last numbered change");
  await expect(page.getByRole("heading", { name: "Alternative perspective" })).toBeVisible();
  await expect(lesson).toContainText("G-counters and GSets are CRDTs");
  await expect(lesson).toContainText("TaskManager retains an ordered volunteer queue");
  await expect(lesson).toContainText("no waiting queue, release, or promotion");
  await expect(page.getByRole("heading", {
    name: "From three pending claims to one permanent entry",
  })).toBeVisible();
  await expect(lesson).toContainText("claim_once");
  await expect(lesson).toContainText("Reset button creates a new demo room");
  await expect(lesson).not.toContainText("slip");
  await expect(page.getByTestId("claims-demo").getByRole("heading", {
    name: "Claim one shared key",
  })).toBeVisible();
  await expect(page.getByTestId("claims-demo")).toContainText("Pending request");
});

test("remaining lessons retain content without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const [slug, name] of examples) {
      await page.goto(`/structures/${slug}/`);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(name);
      const demo = page.getByTestId(`${slug}-demo`);
      await expect(demo.locator("[data-client]")).toHaveCount(3);
      await expect(demo.locator(".remaining-local-record")).toHaveCount(3);
      await expect(demo.locator(".remaining-paper-note")).toHaveCount(3);
      await expect(demo.getByRole("button").first()).toBeDisabled();
      await expect(demo).toContainText("Enable JavaScript to run the race");
      if (slug === "shared-sequence") {
        await expect(demo.locator("[data-sequence-insert]")).toHaveCount(3);
        await expect(demo.locator("[data-insert-submit]").first()).toBeDisabled();
        const notebook = page.getByRole("table", {
          name: "Each hiker's inspection route before and after sharing",
        });
        await expect(notebook.locator("sup")).toHaveText([
          "A:4", "A:4", "B:4", "B:4", "A:4", "B:4", "A:4", "B:4",
        ]);
        await expect(notebook.locator("ins")).toHaveCount(6);
        await expect(notebook.locator("ins").first()).toHaveCSS("background-color", "oklch(0.84 0.18 100)");
        await expect(notebook.locator("ins").first()).toHaveCSS("text-decoration-line", "none");
        await expect(notebook.locator('ins[data-stop="marsh"]').first()).toHaveCSS("background-color", "oklch(0.29 0.075 238)");
        await expect(notebook.locator('ins[data-stop="marsh"]').first()).toHaveCSS("text-decoration-line", "none");
        await expect(notebook.locator('ins[data-stop="marsh"]').first()).toHaveCSS("color", "oklch(0.99 0.006 220)");
        await expect(page.getByRole("heading", { name: "Quick facts" })).toBeVisible();
      }
    }
  } finally {
    await context.close();
  }
});

test("direct controls remain active after another client queues work", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  const controls = demo.locator("[data-sequence-insert]");
  await expect(controls).toHaveCount(3);
  for (const form of await controls.all()) {
    const names = form.locator("select[data-insert-name]");
    await expect(names).toBeEnabled();
    await expect(names).toHaveValue("");
    await expect(names.locator("option")).toHaveText([
      "Choose a trail stop", "Falls", "Marsh", "Ridge", "Lookout",
    ]);
    await expect(form.getByLabel("Position")).toBeEnabled();
    await expect(form.getByRole("button", { name: "Insert trail stop" })).toBeEnabled();
  }
  await demo.locator("[data-transport-auto-deliver]").uncheck();
  await controls.nth(0).getByLabel("Trail stop name").selectOption("Ridge");
  await controls.nth(0).getByRole("button", { name: "Insert trail stop" }).click();
  await controls.nth(0).getByLabel("Trail stop name").selectOption("Lookout");
  await controls.nth(0).getByRole("button", { name: "Insert trail stop" }).click();
  await controls.nth(2).getByLabel("Trail stop name").selectOption("Marsh");
  await controls.nth(2).getByRole("button", { name: "Insert trail stop" }).click();
  await expect(demo.locator("[data-pending]")).toHaveText("3 notes waiting");
  await expect(demo.locator('[data-client="A"] [data-local-record]')).toContainText("Lookout");
  await expect(demo.locator('[data-client="C"] [data-local-record]')).toContainText("Marsh");
});

test("SharedSequence controls stay active while notes are in flight", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  const alice = demo.locator('[data-client="A"] [data-sequence-insert]');
  const bob = demo.locator('[data-client="B"] [data-sequence-insert]');
  await alice.getByLabel("Trail stop name").selectOption("Ridge");
  await alice.getByRole("button", { name: "Insert trail stop" }).click();
  await expect(demo.locator(".remaining-operation-pulse.outbound")).toBeVisible();
  for (const control of await demo.locator(
    "[data-sequence-insert] select, [data-insert-submit]",
  ).all()) {
    await expect(control).toBeEnabled();
  }
  await expect(demo.getByRole("button", { name: "Race the route insertions" })).toBeEnabled();
  await bob.getByLabel("Trail stop name").selectOption("Lookout");
  await bob.getByRole("button", { name: "Insert trail stop" }).click();
  await expect(demo.locator("[data-pending]")).toHaveText("0 notes waiting");
  await expect(demo.locator("[data-state]")).toContainText("Ridge");
  await expect(demo.locator("[data-state]")).toContainText("Lookout");
});

test("SharedSequence shows each local route and the insertion notes in transit", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  await demo.locator("[data-transport-auto-deliver]").uncheck();
  const alice = demo.locator('[data-client="A"] [data-sequence-insert]');
  const bob = demo.locator('[data-client="B"] [data-sequence-insert]');
  const carol = demo.locator('[data-client="C"] [data-sequence-insert]');
  await alice.getByLabel("Trail stop name").selectOption("Falls");
  await alice.getByLabel("Position").selectOption({ label: "Before Weir (position 2)" });
  await alice.getByRole("button", { name: "Insert trail stop" }).click();
  await expect(alice.getByLabel("Position").locator("option:checked")).toHaveText("Before Weir (position 3)");
  await expect(demo.locator('[data-client="A"] [data-local-record] sup')).toHaveCount(0);
  await expect(demo.locator("[data-local-record]")).toHaveText([
    "Bridge · Falls · Weir · North gate",
    "Bridge · Weir · North gate",
    "Bridge · Weir · North gate",
  ]);
  await expect(demo.getByRole("region", { name: "Carol's current route" }))
    .toContainText("BridgeWeirNorth gate");
  await expect(demo.locator("[data-pending]")).toHaveText("1 note waiting");
  await expect(demo.getByRole("list", { name: "Insertion note log, newest first" }))
    .toContainText("Alice: Insert Falls before Weir — waiting");

  await bob.getByLabel("Trail stop name").selectOption("Marsh");
  await bob.getByRole("button", { name: "Insert trail stop" }).click();
  await carol.getByLabel("Trail stop name").selectOption("Falls");
  await carol.getByRole("button", { name: "Insert trail stop" }).click();
  await expect(demo.locator("[data-pending]")).toHaveText("3 notes waiting");
  await expect(demo.locator("[data-note-log] li")).toHaveText([
    "Carol: Insert Falls before Weir — waiting",
    "Bob: Insert Marsh before Weir — waiting",
    "Alice: Insert Falls before Weir — waiting",
  ]);
  await demo.locator("[data-transport-auto-deliver]").check();
  await expect(demo.locator("[data-pending]")).toHaveText("0 notes waiting");
  const routes = await demo.locator("[data-local-record]").allTextContents();
  expect(routes).toEqual([routes[0], routes[0], routes[0]]);
  expect(routes[0].match(/Falls/g)).toHaveLength(2);
  await expect(demo.locator("[data-note-log] li").first())
    .toHaveText("Carol: Insert Falls before Weir — delivered");
  await carol.getByLabel("Trail stop name").selectOption("Ridge");
  await carol.getByLabel("Position").selectOption({ label: "At end" });
  await carol.getByRole("button", { name: "Insert trail stop" }).click();
  await expect(carol.getByLabel("Position").locator("option:checked")).toHaveText("At end");
  await expect(demo.locator("[data-note-log] li").first())
    .toHaveText("Carol: Insert Ridge at the end — waiting");
  await expect(demo.locator("[data-note-log] li").nth(1))
    .toHaveText("Carol: Insert Falls before Weir — delivered");
  await demo.getByRole("button", { name: "Reset" }).click();
  await expect(demo.locator("[data-pending]")).toHaveText("0 notes waiting");
  await expect(demo.getByRole("list", { name: "Insertion note log, newest first" }))
    .toHaveText("No insertion notes yet.");
});

test("SharedSequence animates notes to the relay and then to the notebooks", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  await demo.locator("[data-transport-auto-deliver]").uncheck();
  const alice = demo.locator('[data-client="A"] [data-sequence-insert]');
  await alice.getByLabel("Trail stop name").selectOption("Ridge");
  await alice.getByRole("button", { name: "Insert trail stop" }).click();
  const outbound = demo.locator(".remaining-operation-pulse.outbound");
  await expect(outbound).toBeVisible();
  const path = await outbound.evaluate((element) => {
    const effect = element.getAnimations()[0]?.effect;
    if (!(effect instanceof KeyframeEffect)) throw new Error("Missing operation flight");
    return {
      easing: effect.getTiming().easing,
      transforms: effect.getKeyframes().map(({ transform }) => transform),
    };
  });
  expect(path.easing).toBe("linear");
  expect(path.transforms[0]).not.toBe(path.transforms[1]);
  await expect(demo.locator(".remaining-operation-pulse")).toHaveCount(0);
  await expect(demo.locator("[data-state] li")).toHaveText(["Bridge", "Weir", "North gate"]);
  await demo.locator("[data-transport-auto-deliver]").check();
  await expect(demo.locator(".remaining-operation-pulse.shared").first()).toBeVisible();
  await expect(demo.locator("[data-state] li")).toHaveText(["Bridge", "Ridge", "Weir", "North gate"]);
  await expect(demo.locator(".remaining-operation-pulse")).toHaveCount(0);
});

test("SharedSequence broadcasts pending notes together", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  await demo.locator("[data-transport-auto-deliver]").uncheck();
  await demo.getByRole("button", { name: "Race the route insertions" }).click();
  await expect(demo.locator(".remaining-operation-pulse.outbound")).toHaveCount(2);
  await expect(demo.locator(".remaining-operation-pulse")).toHaveCount(0);
  await demo.locator("[data-transport-auto-deliver]").check();
  await expect(demo.locator(".remaining-operation-pulse.shared")).toHaveCount(6);
  await expect(demo.locator(".remaining-operation-pulse")).toHaveCount(0);
});

test("SharedSequence delivers without spatial motion when reduced motion is requested", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  const carol = demo.locator('[data-client="C"] [data-sequence-insert]');
  await carol.getByLabel("Trail stop name").selectOption("Lookout");
  await carol.getByRole("button", { name: "Insert trail stop" }).click();
  await expect(demo.locator("[data-local-record]")).toHaveText([
    "Bridge · Lookout · Weir · North gate",
    "Bridge · Lookout · Weir · North gate",
    "Bridge · Lookout · Weir · North gate",
  ]);
  await expect(demo.locator(".remaining-operation-pulse")).toHaveCount(0);
});

test("SharedSequence uses the reading column and a wider sandbox", async ({ page }) => {
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/structures/shared-sequence/");
    const article = page.locator(".structure-lesson");
    const demo = page.getByTestId("shared-sequence-demo");
    const facts = page.locator(".structure-facts");
    await expect(article.locator(".page-intro .structure-kind-tag")).toHaveCount(0);
    await expect(facts.locator(".structure-kind-tag")).toHaveCount(1);
    const articleBox = await article.boundingBox();
    const demoBox = await demo.boundingBox();
    const factsBox = await facts.boundingBox();
    expect(articleBox!.width).toBeLessThanOrEqual(710);
    expect(demoBox!.width).toBeGreaterThanOrEqual(articleBox!.width);
    expect(demoBox!.x).toBeGreaterThanOrEqual(0);
    expect(demoBox!.x + demoBox!.width).toBeLessThanOrEqual(width);
    expect(factsBox!.y + factsBox!.height).toBeLessThan(demoBox!.y);
    expect(factsBox!.x).toBeGreaterThanOrEqual(0);
    expect(factsBox!.x + factsBox!.width).toBeLessThanOrEqual(width);
    await expect(demo.locator(".remaining-demo")).toHaveCSS("background-color", "oklch(0.29 0.075 238)");
    await expect(article.getByRole("navigation", { name: "SharedSequence lesson map" }))
      .toBeVisible();
    await expect(article.getByRole("heading", { name: "Quick facts" })).toBeVisible();
    await expect(article.getByRole("table", { name: "Each hiker's inspection route before and after sharing" }))
      .toBeVisible();
    const notebook = article.locator(".route-notebooks");
    await expect(notebook.locator("tbody tr").nth(0).locator("td").first().locator("ins")).toHaveText(["FallsA:4"]);
    await expect(notebook.locator("tbody tr").nth(1).locator("td").first().locator("ins")).toHaveText(["MarshB:4"]);
    await expect(notebook.locator("tbody tr").nth(2).locator("td").first().locator("ins")).toHaveCount(0);
    await expect(notebook.locator("tbody tr").nth(0).locator("td").nth(1).locator("ins")).toHaveText(["MarshB:4"]);
    await expect(notebook.locator("tbody tr").nth(1).locator("td").nth(1).locator("ins")).toHaveText(["FallsA:4"]);
    await expect(notebook.locator("tbody tr").nth(2).locator("td").nth(1).locator("ins")).toHaveText(["FallsA:4", "MarshB:4"]);
    await expect(notebook.locator('ins[data-stop="falls"]')).toHaveCount(3);
    await expect(notebook.locator('ins[data-stop="marsh"]')).toHaveCount(3);
    await expect(notebook.locator(".route-key")).toHaveText(["Yellow: Falls (Alice)", "Blue: Marsh (Bob)"]);
    if (width === 390) {
      await notebook.locator(".route-table-scroll").evaluate((element) => {
        element.scrollLeft = element.scrollWidth;
      });
      const captionBox = await notebook.locator("figcaption").boundingBox();
      expect(captionBox!.x).toBeGreaterThanOrEqual(0);
      expect(captionBox!.x + captionBox!.width).toBeLessThanOrEqual(width);
    }
    await expect(demo.locator("[data-sequence-insert]")).toHaveCount(3);
    const relay = demo.locator(".remaining-exchange");
    await expect(relay.locator("[data-note-log]")).toHaveCSS("min-height", "160px");
    await expect(notebook.locator("figcaption")).toContainText("Each highlight shows a trail stop new to that notebook.");
    await expect(article.locator("#route-setup")).not.toContainText("not set additions");
    await expect(article.locator("#route-setup > p")).toContainText("a unique name");
    await expect(article.locator("#route-setup > p")).toContainText("put concurrent insertions in the same order");
    await expect(notebook.locator("table")).toHaveCSS("font-size", "14px");
    const hikerColumn = notebook.locator("tbody th").first();
    expect((await hikerColumn.boundingBox())!.width).toBeGreaterThanOrEqual(90);
    await expect(hikerColumn).toHaveCSS("white-space", "nowrap");
  }
  for (const [slug] of examples) {
    await page.goto(`/structures/${slug}/`);
    await expect(page.locator(".page-intro .structure-kind-tag")).toHaveCount(0);
  }
});

test("reset cancels an in-flight kernel delivery", async ({ page }) => {
  await page.goto("/structures/shared-sequence/");
  const demo = page.getByTestId("shared-sequence-demo");
  await demo.getByRole("button", { name: "Race the route insertions" }).click();
  await expect(demo.locator(".remaining-operation-pulse.outbound").first()).toBeVisible();
  await demo.getByRole("button", { name: "Reset" }).click();
  await expect(demo.locator(".remaining-operation-pulse")).toHaveCount(0);
  await page.waitForTimeout(2_100);
  await expect(demo.locator("[data-state] li")).toHaveText([
    "Bridge",
    "Weir",
    "North gate",
  ]);
});

test("kernel errors are visible and preserve the last valid state", async ({ page }) => {
  await page.goto("/structures/claims/");
  const demo = page.getByTestId("claims-demo");
  const controls = demo.locator("[data-client-action]");
  await controls.first().click();
  await expect(demo.locator("[data-state] li")).toHaveText(["gate-key: Alice"]);
  await controls.nth(1).click();
  await expect(demo.locator("[data-error]")).toContainText("change failed");
  await expect(demo.locator("[data-state] li")).toHaveText(["gate-key: Alice"]);
});

test("a direct claim shows the kernel winner instead of the scripted race result", async ({ page }) => {
  await page.goto("/structures/claims/");
  const demo = page.getByTestId("claims-demo");
  await demo.locator('[data-client="B"] [data-client-action]').click();
  await expect(demo.locator("[data-local-record]")).toHaveText([
    "gate-key: Bob",
    "gate-key: Bob",
    "gate-key: Bob",
  ]);
  await expect(demo.locator("[data-status]")).toHaveText("Sequenced through SN 1.");
  await expect(demo.locator("[data-note-log] li")).toHaveText(
    "SN 1 · Bob: Claim gate-key for Bob — delivered",
  );
});

test("model and lesson prose distinguish local edits from sequenced outcomes", async ({ page }) => {
  await page.goto("/structures/models/");
  const dds = page.locator("#dds");
  await expect(dds).toContainText("SharedCounter, SharedMap, and SharedDirectory show an author's change locally before it has a number.");
  await expect(dds).toContainText("Claims, RegisterMap, and FifoWorkQueue wait for a number");
  await expect(dds).toContainText("TaskManager tracks a pending volunteer locally but waits for sequencing");
  await expect(dds).toContainText("PactMap waits for sequencing to show a pending proposal");
  await expect(page.locator("#ot")).toContainText("Both show local edits before the sequencer confirms them.");
  await expect(page.getByRole("row", { name: /Local change before shared order/ })).toContainText("Yes; the edit stays pending");
  await expect(page.getByRole("heading", { name: "Before the sequencer replies" })).toBeVisible();
  await expect(page.locator(".local-visibility")).toContainText("Their clients send one operation at a time and buffer further local edits");

  for (const [slug, detail] of [
    ["shared-counter", "The local update is optimistic."],
    ["shared-map", "Alice sees her own note as soon as she writes it."],
    ["shared-directory", "Alice can use her new folder and see the notes she adds or removes"],
    ["register-map", "Writes stay hidden until the sequencer"],
    ["claims", "her ledger still shows that nobody holds the gate key"],
    ["fifo-work-queue", "None can mark the inspection as theirs until a numbered request"],
    ["task-manager", "She cannot mark herself assigned or even confirmed in the queue until"],
    ["pact-map", "Only after the required stations sign off can anyone read the new value."],
    ["json-ot", "Alice sees her title edit before the ranger gives it a number"],
    ["shared-rich-text", "Alice sees the bold heading as soon as she edits it"],
  ] as const) {
    await page.goto(`/structures/${slug}/`);
    await expect(page.locator("article").first()).toContainText(detail);
  }
});
