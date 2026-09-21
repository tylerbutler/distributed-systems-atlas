import { expect, test } from "@playwright/test";

test("the correction race converges through Sluice", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/pn-counter/");
  const demo = page.getByTestId("pn-counter-demo");
  const totals = demo.locator("[data-pn-total]");
  const race = demo.getByRole("button", {
    name: "Run Alice +3 and Bob -1 correction",
  });

  await expect(totals).toHaveText(["10", "10", "10"]);
  await race.click();
  await expect(totals).toHaveText(["12", "12", "12"]);
  await expect(race).toBeFocused();
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Both checkpoint notes reached every hiker. All three read 12 birds.",
  );
  await expect(demo.getByLabel("Correction notes shared")).toHaveText("2 notes");
  await expect(demo.getByRole("list", { name: "Correction note log" })
    .getByRole("listitem")).toHaveCount(2);

  await demo.getByText("Open the hikers' two notebook tables", {
    exact: true,
  }).click();
  await expect(demo.getByRole("table", {
    name: "Sightings in each hiker's PN-counter",
  }).locator("tbody td")).toHaveText([
    "10", "10", "10",
    "3", "3", "3",
    "0", "0", "0",
    "0", "0", "0",
  ]);
  await expect(demo.getByRole("table", {
    name: "Corrections in each hiker's PN-counter",
  }).locator("tbody td")).toHaveText([
    "0", "0", "0",
    "1", "1", "1",
    "0", "0", "0",
  ]);
});

test("manual sightings and corrections deliver immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/pn-counter/");
  const demo = page.getByTestId("pn-counter-demo");
  const totals = demo.locator("[data-pn-total]");

  await demo.getByRole("button", { name: "Record 1 more bird for Alice" }).click();
  await expect(totals).toHaveText(["11", "11", "11"]);
  await demo.getByRole("button", { name: "Correct 3 duplicate sightings for Bob" }).click();
  await expect(totals).toHaveText(["8", "8", "8"]);
  await demo.getByRole("button", { name: "Record 3 more birds for Carol" }).click();
  await expect(totals).toHaveText(["11", "11", "11"]);
  await expect(demo.getByRole("list", { name: "Correction note log" })
    .getByRole("listitem")).toHaveCount(3);
  await expect(demo.getByRole("button", {
    name: "Record 3 more birds for Carol",
  })).toBeFocused();

  await demo.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(totals).toHaveText(["10", "10", "10"]);
  await expect(demo.locator('[role="status"]')).toHaveText(
    "Run the correction race, or record new birds and corrections for any hiker.",
  );
});

test("replica controls stay active while several notes travel", async ({ page }) => {
  await page.goto("/structures/pn-counter/");
  const demo = page.getByTestId("pn-counter-demo");
  const alice = demo.getByRole("button", { name: "Record 1 more bird for Alice" });
  const bob = demo.getByRole("button", { name: "Correct 1 duplicate sighting for Bob" });
  const carol = demo.getByRole("button", { name: "Record 3 more birds for Carol" });

  await alice.click();
  await expect(bob).toBeEnabled();
  await bob.click();
  await expect(carol).toBeEnabled();
  await carol.click();

  await expect(demo.locator("[data-pn-total]")).toHaveText(["13", "13", "13"], {
    timeout: 10_000,
  });
  await expect(demo.getByRole("list", { name: "Correction note log" })
    .getByRole("listitem")).toHaveCount(3);
});

test("PN-counter notes use the same Sluice motion language", async ({ page }) => {
  await page.goto("/structures/pn-counter/");
  const demo = page.getByTestId("pn-counter-demo");

  await demo.getByRole("button", { name: "Record 1 more bird for Alice" }).click();
  await expect(demo.locator('[data-leg="outbound"]')).toContainText(
    "Alice +1 · 1000 ms",
  );
  await expect(demo.locator('[data-leg="sequenced"]').first()).toBeVisible();
  await expect(demo.locator("[data-pn-total]")).toHaveText(["11", "10", "10"]);
  await expect(demo.locator("[data-pn-total]")).toHaveText(["11", "11", "11"], {
    timeout: 10_000,
  });
});

test("PN-counter content remains useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({
    javaScriptEnabled: false,
    viewport: { width: 390, height: 844 },
  });
  try {
    const page = await context.newPage();
    await page.goto("/structures/pn-counter/");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("PN-counter");
    const facts = page.getByRole("complementary", { name: "Quick facts" });
    await expect(facts).toContainText("CRDT");
    await expect(facts).toContainText("Increment and decrement");
    await expect(facts).toContainText("Two integers for each replica");
    await expect(page.getByRole("figure", {
      name: "Concurrent sightings and corrections merge into one PN-counter",
    })).toBeVisible();
    await expect(page.getByTestId("g-counter-demo")).toHaveCount(0);
    await expect(page.getByRole("heading", {
      name: "Each hiker carries the same two-page notebook",
    })).toBeVisible();
    await expect(page.getByRole("table", {
      name: "PN-counter notebook before new notes",
    }).locator("tbody tr")).toHaveText([
      "Sightings (P)Agreed count10",
      "Sightings (P)Alice0",
      "Sightings (P)Bob0",
      "Sightings (P)Carol0",
      "Corrections (N)Alice0",
      "Corrections (N)Bob0",
      "Corrections (N)Carol0",
    ]);
    await expect(page.getByRole("group", {
      name: "PN-counter checkpoint note examples",
    }).locator("p")).toHaveText([
      "AliceSightings page · Alice row3",
      "BobCorrections page · Bob row1",
    ]);
    await expect(page.getByRole("heading", {
      name: "Add a second G-counter",
    })).toBeVisible();
    await expect(page.getByRole("region", {
      name: "Add a second G-counter",
    })).toContainText("The positive counter records sightings");
    await expect(page.getByRole("region", {
      name: "Add a second G-counter",
    })).toContainText("The negative counter records corrections");
    await expect(page.getByRole("heading", {
      name: "Alice and Bob fill in different pages",
    })).toBeVisible();
    await expect(page.getByLabel("Each PN-counter notebook before note delivery")
      .locator("tbody tr")).toHaveText([
      "Agreed sightings101010",
      "Alice sightings row300",
      "Bob corrections row010",
      "Birds seen (P - N)13910",
    ]);
    await expect(page.getByRole("region", {
      name: "Add a second G-counter",
    }).getByLabel("PN-counter bird total rule")).toContainText(
      "P = sightings G-counter N = corrections G-counter birds = P - N",
    );
    const sluiceDefinition = page.getByLabel("Sluice definition");
    await expect(sluiceDefinition).toContainText(
      "connects clients, sequences their operations",
    );
    await expect(sluiceDefinition.getByRole("link", { name: "Sluice" }))
      .toHaveAttribute("href", "/glossary/#sluice");
    const demo = page.getByTestId("pn-counter-demo");
    await expect(demo.locator("[data-pn-total]")).toHaveText(["10", "10", "10"]);
    await expect(demo.getByRole("button", {
      name: "Run Alice +3 and Bob -1 correction",
    })).toBeDisabled();
    await expect(demo.getByRole("button", {
      name: "Share waiting notes",
    })).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("PN-counter controls remain keyboard sized without overflow", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/pn-counter/");
  const demo = page.getByTestId("pn-counter-demo");
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    )).toBe(0);
    for (const control of await demo.locator("button, summary").all()) {
      expect((await control.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  expect(await demo.evaluate((element) => [element, ...element.querySelectorAll("*")].every((node) => {
    const style = getComputedStyle(node);
    return style.animationName === "none" && style.transitionDuration === "0s";
  }))).toBe(true);
});
