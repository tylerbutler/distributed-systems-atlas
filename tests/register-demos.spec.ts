import { expect, test } from "@playwright/test";

for (const example of [
  {
    path: "/structures/lww-register/",
    testId: "lww-register-demo",
    race: "Sequence and share the reports",
    values: [["Trail closed"], ["Trail closed"], ["Trail closed"]],
    evidence: "Sequence 2 · Bob's write wins.",
  },
  {
    path: "/structures/multi-value-register/",
    testId: "mv-register-demo",
    race: "Race Alice's and Bob's reports",
    values: [["Trail closed", "Trail open"], ["Trail closed", "Trail open"], ["Trail closed", "Trail open"]],
    evidence: "2 concurrent alternatives retained.",
  },
  {
    path: "/structures/register-collection/",
    testId: "register-collection-demo",
    race: "Race the two station submissions",
    values: [["Trail open"], ["Trail open"], ["Trail open"]],
    evidence: "Atomic: Trail open · Latest: Trail closed · 2 versions retained.",
  },
]) {
  test(`${example.testId} runs its three-client authored race`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(example.path);
    const demo = page.getByTestId(example.testId);
    const race = demo.getByRole("button", { name: example.race });

    await expect(demo.locator("[data-client]")).toHaveCount(3);
    await expect(demo.getByText("Field note", { exact: true })).toHaveCount(3);
    await expect(demo.getByRole("combobox", { name: "Trail status" })).toHaveCount(3);
    await expect(demo.getByRole("button", { name: "Write status" })).toHaveCount(3);
    await expect(demo.locator(".paper-note").first()).toContainText(
      "trail-status: Trail open",
    );
    await race.click();
    for (const [index, values] of example.values.entries()) {
      await expect(demo.locator("[data-register-values]").nth(index).locator("span"))
        .toHaveText(values);
    }
    await expect(demo.locator("[data-evidence]")).toHaveText(example.evidence);
    await expect(race).toBeFocused();
  });
}

test("register controls stay active while writes travel", async ({ page }) => {
  await page.goto("/structures/multi-value-register/");
  const demo = page.getByTestId("mv-register-demo");
  const alice = demo.locator('[data-client="A"]');
  const carol = demo.locator('[data-client="C"]');

  await alice.getByRole("combobox", { name: "Trail status" }).selectOption("Trail open");
  await alice.getByRole("button", { name: "Write status" }).click();
  await expect(demo.locator(".register-operation-pulse")).toContainText("Trail open");
  await expect(carol.getByRole("button", { name: "Write status" })).toBeEnabled();
  await carol.getByRole("combobox", { name: "Trail status" }).selectOption("Inspect bridge");
  await carol.getByRole("button", { name: "Write status" }).click();
  await expect(demo.locator("[data-register-values] span")).toHaveCount(6, {
    timeout: 10_000,
  });
});

test("register replicas update after the shared write arrives", async ({ page }) => {
  await page.goto("/structures/multi-value-register/");
  const demo = page.getByTestId("mv-register-demo");
  const alice = demo.locator('[data-client="A"]');

  await alice.getByRole("combobox", { name: "Trail status" }).selectOption("Trail open");
  await alice.getByRole("button", { name: "Write status" }).click();
  await expect(demo.locator(".register-operation-pulse.shared").first()).toBeVisible();
  await expect(demo.locator("[data-register-values] span")).toHaveText([
    "Trail open",
  ]);

  await expect(demo.locator("[data-register-values] span")).toHaveText([
    "Trail open",
    "Trail open",
    "Trail open",
  ], { timeout: 10_000 });
});

test("register lessons remain useful without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    for (const [path, heading, testId] of [
      ["/structures/lww-register/", "LWWRegister", "lww-register-demo"],
      ["/structures/multi-value-register/", "MvRegister", "mv-register-demo"],
      ["/structures/register-collection/", "RegisterCollection", "register-collection-demo"],
    ]) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(heading);
      const demo = page.getByTestId(testId);
      await expect(demo.locator("[data-client]")).toHaveCount(3);
      await expect(demo.getByRole("button").first()).toBeDisabled();
      await expect(demo).toContainText("Enable JavaScript to run the demo");
    }
  } finally {
    await context.close();
  }
});

test("register facts leave room for the demo", async ({ page }) => {
  for (const [path, testId] of [
    ["/structures/lww-register/", "lww-register-demo"],
    ["/structures/multi-value-register/", "mv-register-demo"],
    ["/structures/register-collection/", "register-collection-demo"],
  ]) {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(path);
      const facts = (await page.locator(".register-lesson > .structure-facts").boundingBox())!;
      const demo = (await page.getByTestId(testId).boundingBox())!;
      expect(demo.y).toBeGreaterThanOrEqual(facts.y + facts.height);
      expect(await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      )).toBe(0);
    }
  }
});

test("MvRegister notebook values show superscript write identities", async ({ page }) => {
  await page.goto("/structures/multi-value-register/");
  const table = page.getByRole("table", { name: "MvRegister notebook checkpoints" });
  await expect(table.locator("tbody sup")).toHaveText([
    "A:1", "A:1", "B:1",
    "B:1", "A:1", "B:1",
    "A:1", "B:1",
  ]);
  await expect(table.locator("tbody td code")).toHaveCount(0);
});

test("the register family links every dedicated lesson", async ({ page }) => {
  await page.goto("/structures/registers/");
  await expect(page.getByRole("link", { name: "Open the LWWRegister lesson" }))
    .toHaveAttribute("href", "/structures/lww-register/");
  await expect(page.getByRole("link", { name: "Open the MvRegister lesson" }))
    .toHaveAttribute("href", "/structures/multi-value-register/");
  await expect(page.getByRole("link", { name: "Open the RegisterCollection lesson" }))
    .toHaveAttribute("href", "/structures/register-collection/");
});

test("reset restores an empty register room", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/lww-register/");
  const demo = page.getByTestId("lww-register-demo");
  await demo.getByRole("button", { name: "Sequence and share the reports" }).click();
  await demo.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(demo.locator("[data-register-values] span")).toHaveCount(0);
  await expect(demo.locator("[data-evidence]")).toHaveText(
    "No sequenced write yet.",
  );
});
