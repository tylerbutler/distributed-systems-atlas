import { expect, test } from "@playwright/test";

test("the hikers' checkpoint notes converge and a repeated note is safe", async ({ page }) => {
  await page.goto("/structures/g-counter/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  const race = demo.getByRole("button", { name: "Leave Alice +7 and Bob +3 together" });
  const resend = demo.locator('[data-action="resend"]');

  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(race).toBeEnabled();
  await expect(resend).toBeDisabled();
  const pace = demo.getByRole("slider", { name: "Speed" });
  await pace.fill("2");
  await expect(demo.locator("[data-pace-output]")).toHaveText("2×");
  const guided = demo.getByRole("checkbox", { name: "Guided observations" });
  await guided.check();
  await expect(demo.getByRole("heading", { name: "How checkpoint notes merge" })).toBeVisible();
  await expect(demo.getByText("another copy of Alice's 7 changes nothing.")).toBeVisible();
  await race.focus();
  await race.press("Enter");
  await expect(demo.locator(".operation-pulse").first()).toBeVisible();
  await expect(demo.getByRole("region", { name: "Known checkpoint" }))
    .toHaveAttribute("data-guided-mark", "box");
  await expect(demo.locator("svg.rough-annotation")).toBeVisible();
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(totals.first()).toHaveAttribute("data-guided-mark", "circle");
  await expect(resend).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "The final checkpoint note reached every hiker. All three read 10 birds.",
  );
  const log = demo.getByRole("list", { name: "Checkpoint note log" });
  await expect(log.getByRole("listitem")).toHaveCount(2);
  await expect(log).toContainText(
    "Alice left a checkpoint note for Alice, Bob, Carol",
  );

  await demo.getByText("Open the hikers' count tables", { exact: true }).click();
  await expect(demo.getByRole("table", { name: "Largest counts in each hiker's notebook" })
    .locator("tbody td")).toHaveText(["7", "7", "7", "3", "3", "3", "0", "0", "0"]);

  const resendB = demo.getByRole("button", { name: "Repeat Bob's note" });
  await resendB.press("Space");
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(resendB).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Bob left the same checkpoint note again. All three hikers still read 10 birds.",
  );
  await expect(log.getByRole("listitem")).toHaveCount(3);
  await resendB.click();
  await expect(totals).toHaveText(["10", "10", "10"]);

  const reset = demo.getByRole("button", { name: "Reset", exact: true });
  await reset.click();
  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(demo.getByRole("button", { name: "Record 1 bird for Alice" })).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Count birds with Alice, Bob, or Carol, or leave Alice's and Bob's checkpoint notes together.",
  );
});

test("multiple checkpoint notes can wait before sharing", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/g-counter/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  const autoDeliver = demo.getByRole("checkbox", { name: "Auto-deliver" });

  await expect(autoDeliver).toBeChecked();
  await autoDeliver.uncheck();
  await demo.getByRole("button", { name: "Record 1 bird for Alice" }).click();
  await demo.getByRole("button", { name: "Record 3 birds for Alice" }).click();
  await demo.getByRole("button", { name: "Record 3 birds for Bob" }).click();
  await demo.getByRole("button", { name: "Record 7 birds for Bob" }).click();
  await demo.getByRole("button", { name: "Record 1 bird for Carol" }).click();
  await demo.getByRole("button", { name: "Record 7 birds for Carol" }).click();
  await expect(totals).toHaveText(["4", "10", "8"]);
  await expect(demo.locator('[role="status"]')).toContainText(
    "6 checkpoint notes are waiting",
  );
  await autoDeliver.check();
  await expect(totals).toHaveText(["22", "22", "22"]);
  await expect(demo.getByLabel("Notes left at checkpoint")).toHaveText("6 notes");
  await expect(demo.getByRole("list", { name: "Checkpoint note log" }).getByRole("listitem"))
    .toHaveCount(6);
  await expect(demo.locator('[role="status"]')).toHaveText(
    "The final checkpoint note reached every hiker. All three read 22 birds.",
  );
});

test("auto-deliver keeps replica controls active while operations queue", async ({ page }) => {
  await page.goto("/structures/g-counter/");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  await demo.getByRole("slider", { name: "Speed" }).fill("0.5");

  await demo.getByRole("button", { name: "Record 1 bird for Alice" }).click();
  await expect(demo.getByRole("button", { name: "Record 3 birds for Alice" })).toBeEnabled();
  await demo.getByRole("button", { name: "Record 3 birds for Alice" }).click();
  await demo.getByRole("button", { name: "Record 3 birds for Bob" }).click();
  await demo.getByRole("button", { name: "Record 7 birds for Bob" }).click();
  await demo.getByRole("button", { name: "Record 1 bird for Carol" }).click();
  await demo.getByRole("button", { name: "Record 7 birds for Carol" }).click();

  await expect(totals).toHaveText(["22", "22", "22"], { timeout: 15_000 });
  await expect(demo.getByRole("list", { name: "Checkpoint note log" }).getByRole("listitem"))
    .toHaveCount(6, { timeout: 15_000 });
});

test("notes travel to checkpoints immediately and shared copies overlap", async ({ page }) => {
  await page.goto("/structures/g-counter/");
  const demo = page.getByTestId("g-counter-demo");
  await expect(demo.getByLabel("Checkpoint note states")).toContainText(
    "New note In transit to a checkpoint",
  );
  await expect(demo.getByLabel("Checkpoint note states")).toContainText(
    "Shared note Being delivered to the other hikers",
  );
  await demo.getByRole("slider", { name: "Speed" }).fill("0.5");

  await demo.getByRole("button", { name: "Record 1 bird for Alice" }).click();
  await demo.getByRole("button", { name: "Record 3 birds for Bob" }).click();

  await expect(demo.locator('[data-leg="outbound"]')).toHaveCount(2);
  await expect(demo.locator('[data-leg="outbound"]').first()).toContainText(
    "Alice +1 · 1000 ms",
  );
  await expect(demo.locator('[data-leg="sequenced"]')).toHaveCount(6);
  await expect(demo.locator('[data-leg="sequenced"]').first()).toContainText(
    "Alice note · 1000 ms",
  );
  const dotMotion = await demo.locator(".operation-pulse").first().evaluate((element) => {
    const animation = element.getAnimations()[0];
    const effect = animation?.effect as KeyframeEffect | null;
    return {
      borderRadius: getComputedStyle(element).borderRadius,
      easing: effect?.getTiming().easing,
      frames: effect?.getKeyframes().map(({ transform, opacity }) => ({ transform, opacity })),
    };
  });
  expect(dotMotion).toEqual({
    borderRadius: "50%",
    easing: "ease-in-out",
    frames: [
      { transform: expect.not.stringContaining("scale"), opacity: "0.3" },
      { transform: expect.not.stringContaining("scale"), opacity: "1" },
    ],
  });
  await expect(demo.locator("[data-total]")).toHaveText(["1", "3", "0"]);
  await expect(demo.locator("[data-total]")).toHaveText(["4", "4", "4"]);
});

test("G-counter remains useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/structures/g-counter/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("G-counter");
    const facts = page.getByRole("complementary", { name: "Quick facts" });
    await expect(facts).toContainText("CRDT");
    await expect(facts).toContainText("Increment only");
    await expect(facts).toContainText("One integer for each replica");
    await expect(page.getByRole("figure", {
      name: "Three trail notebooks merge into one G-counter",
    })).toBeVisible();
    await expect(page.getByTestId("pn-counter-demo")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Alice starts counting birds" }))
      .toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Three hikers copy the same notebook" }))
      .toBeVisible();
    await expect(page.getByRole("table", {
      name: "The hikers' notebooks before they share notes",
    }).locator("tbody tr")).toHaveText([
      "Alice700",
      "Bob030",
      "Carol000",
      "Birds seen730",
    ]);
    await expect(page.getByRole("group", {
      name: "Checkpoint note examples",
    }).locator("p")).toHaveText([
      "AliceRunning bird count7",
      "BobRunning bird count3",
    ]);
    await expect(page.getByRole("heading", { name: "Alice fills in her row" }))
      .toBeVisible();
    await expect(page.getByText("Alice's local copy of the shared counter is a replica")).toBeVisible();
    const replicaDefinition = page.getByLabel("replica definition");
    await expect(replicaDefinition).toContainText("can change independently");
    await expect(replicaDefinition.getByRole("link", { name: "replica" }))
      .toHaveAttribute("href", "/glossary/#replica");
    await expect(page.getByRole("heading", {
      name: "Bob takes a different trail",
    })).toBeVisible();
    await expect(page.getByText("It does not add every message")).toBeVisible();
    const gCounterDefinition = page.getByLabel("G-counter definition");
    await expect(gCounterDefinition).toContainText(
      "merges each component by maximum",
    );
    await expect(gCounterDefinition.getByRole("link", { name: "G-counter" }))
      .toHaveAttribute("href", "/glossary/#g-counter");
    await expect(page.getByRole("table", {
      name: "Carol's notebook at each checkpoint",
    }).locator("tbody tr")).toHaveText([
      "Trailhead0000",
      "North fork: Alice 77007",
      "River bridge: Bob 373010",
      "Old lookout: Alice 473010",
    ]);
    await expect(page.getByText("max(7, 4) = 7")).toBeVisible();
    const eventualConsistencyDefinition = page.getByLabel("eventual consistency definition");
    await expect(eventualConsistencyDefinition).toContainText(
      "Once updates stop and all remaining messages arrive, every replica eventually converges on the same state.",
    );
    await expect(eventualConsistencyDefinition.getByRole("link", {
      name: "eventual consistency",
    })).toHaveAttribute("href", "/glossary/#eventual-consistency");
    await expect(page.getByLabel("G-counter merge and bird total rules")).toContainText(
      "count[Alice] = max(all notes from Alice)",
    );
    await expect(page.getByTestId("g-counter-demo").locator("[data-total]")).toHaveText(["0", "0", "0"]);
    await expect(page.getByText("After delivery of both checkpoint notes")).toBeVisible();
    await expect(page.getByRole("button", { name: "Record 1 bird for Alice" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Leave Alice +7 and Bob +3 together" })).toBeDisabled();
    await expect(page.getByRole("slider", { name: "Speed" })).toBeDisabled();
    await expect(page.getByRole("slider", { name: "Speed" })).toHaveAttribute("min", "0.25");
    await expect(page.getByRole("checkbox", { name: "Auto-deliver" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Auto-deliver" })).toBeDisabled();
    await expect(page.getByRole("checkbox", { name: "Guided observations" })).toBeDisabled();
    await expect(page.locator("[data-guided-panel]")).toBeHidden();
    const explanation = page.getByText("Open the hikers' count tables", { exact: true });
    await explanation.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("table", {
      name: "Largest counts in each hiker's notebook",
    })).toBeVisible();
  } finally {
    await context.close();
  }
});

test("G-counter controls meet the keyboard and responsive layout contract", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/g-counter/");
  const demo = page.getByTestId("g-counter-demo");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBe(0);
    const speed = (await demo.locator(".speed-control").boundingBox())!;
    const jitter = (await demo.locator("[data-transport-jitter]").boundingBox())!;
    const autoDeliver = (await demo.locator(".auto-deliver-control").boundingBox())!;
    expect(speed.width).toBeLessThanOrEqual(256);
    if (width < 768) {
      expect(jitter.y).toBeGreaterThanOrEqual(speed.y + speed.height);
      expect(autoDeliver.y).toBeGreaterThanOrEqual(jitter.y + jitter.height);
    } else {
      expect(jitter.x).toBeGreaterThanOrEqual(speed.x + speed.width);
      expect(jitter.x - (speed.x + speed.width)).toBeLessThanOrEqual(16);
      expect(autoDeliver.x).toBeGreaterThanOrEqual(jitter.x + jitter.width);
      expect(autoDeliver.x - (jitter.x + jitter.width)).toBeLessThanOrEqual(16);
    }
    for (const control of await demo.locator("button, summary").all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
    const replicas = demo.getByRole("region", { name: /^(Alice|Bob)'s replica$/ });
    const a = (await replicas.nth(0).boundingBox())!;
    const b = (await replicas.nth(1).boundingBox())!;
    const c = (await demo.getByRole("region", { name: "Carol's replica" }).boundingBox())!;
    const checkpoint = (await demo.getByRole("region", { name: "Known checkpoint" }).boundingBox())!;
    if (width < 768) {
      expect(b.y).toBeGreaterThanOrEqual(a.y + a.height);
      expect(c.y).toBeGreaterThanOrEqual(b.y + b.height);
      expect(checkpoint.y).toBeGreaterThan(a.y + a.height);
      expect(b.y).toBeGreaterThan(checkpoint.y + checkpoint.height);
    } else {
      expect(b.y).toBe(a.y);
      expect(c.y).toBeGreaterThanOrEqual(a.y + a.height);
      expect(c.x).toBeGreaterThan(a.x);
      expect(c.x).toBeLessThan(b.x);
      expect(checkpoint.x - (a.x + a.width)).toBeGreaterThan(20);
      expect(b.x - (checkpoint.x + checkpoint.width)).toBeGreaterThan(20);
    }
  }
  expect(await demo.evaluate((element) => [element, ...element.querySelectorAll("*")].every((node) => {
    const style = getComputedStyle(node);
    return style.animationName === "none" && style.transitionDuration === "0s";
  }))).toBe(true);
});
