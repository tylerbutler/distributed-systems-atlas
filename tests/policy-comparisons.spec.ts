import { expect, test } from "@playwright/test";
import { policyExamples } from "../src/lib/structure-demo/policy-comparisons";

const examples = [
  { kind: "counter", slug: "g-counter", initial: "0", left: "3", right: "10" },
  { kind: "register", slug: "lww-register", initial: "empty", left: "Trail closed", right: "Trail closed | Trail open" },
  { kind: "readd", slug: "two-p-set", initial: "Eagle Creek", left: "empty", right: "Eagle Creek" },
  { kind: "replay", slug: "observed-remove-set", initial: "Eagle Creek", left: "Eagle Creek", right: "empty" },
] as const;

for (const example of examples) {
  test(`${example.kind} comparison uses matched inputs and retains keyboard focus`, async ({ page }) => {
    await page.goto(`/structures/${example.slug}/`);
    const demo = page.getByTestId(`${example.kind}-policy-comparison`);
    await expect(demo).toHaveAttribute("data-ready", "true");
    await expect(demo.locator("[data-policy-left]")).toHaveText(Array(3).fill(example.initial));
    await expect(demo.locator("[data-policy-right]")).toHaveText(Array(3).fill(example.initial));
    await expect(demo).toContainText(policyExamples[example.kind].input);
    const next = demo.locator("[data-policy-advance]");
    await next.focus();
    let actions = 0;
    await page.keyboard.press("Enter");
    actions += 1;
    await expect(next).toBeFocused();
    await page.keyboard.press("Enter");
    actions += 1;
    await expect(demo).toHaveAttribute("data-phase", "2");
    await expect(demo.locator("[data-policy-left]")).toHaveText(Array(3).fill(example.left));
    await expect(demo.locator("[data-policy-right]")).toHaveText(Array(3).fill(example.right));
    if (example.kind === "counter") {
      await next.click();
      actions += 1;
      await expect(demo.locator("[data-policy-right]")).toHaveText(["10", "10", "10"]);
    }
    expect(actions).toBeLessThanOrEqual(3);
    const reset = demo.locator("[data-policy-reset]");
    await expect(reset).toBeFocused();
    await reset.click();
    await expect(next).toBeFocused();
    await expect(demo.locator("[data-policy-left]")).toHaveText(Array(3).fill(example.initial));
    await expect(demo.locator("[data-policy-right]")).toHaveText(Array(3).fill(example.initial));
  });

  test(`${example.kind} comparison keeps its initial values without JavaScript`, async ({ browser, page }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const staticPage = await context.newPage();
      await staticPage.goto(`/structures/${example.slug}/`);
      const staticDemo = staticPage.getByTestId(`${example.kind}-policy-comparison`);
      const initial = await staticDemo.locator("[data-policy-left], [data-policy-right]").allTextContents();
      expect(initial).toHaveLength(6);
      await expect(staticDemo.locator("[data-policy-advance]")).toBeDisabled();
      await expect(staticDemo).toContainText(policyExamples[example.kind].lesson);
      await page.goto(`/structures/${example.slug}/`);
      const live = page.getByTestId(`${example.kind}-policy-comparison`);
      await expect(live).toHaveAttribute("data-ready", "true");
      await expect(live.locator("[data-policy-left], [data-policy-right]")).toHaveText(initial);
    } finally {
      await context.close();
    }
  });
}

test("comparison failures show an error without changing the last valid view", async ({ page }) => {
  await page.goto("/structures/g-counter/");
  const demo = page.getByTestId("counter-policy-comparison");
  const advance = demo.locator("[data-policy-advance]");
  await advance.click();
  const before = await demo.locator("[data-policy-left], [data-policy-right]").allTextContents();
  await demo.evaluate((element) => element.setAttribute("data-kind", "invalid"));
  await advance.click();
  await expect(demo.locator("[data-policy-error]")).toContainText("last valid state is unchanged");
  await expect(demo.locator("[data-policy-left], [data-policy-right]")).toHaveText(before);
  await expect(demo).toHaveAttribute("data-phase", "1");
  await demo.evaluate((element) => element.setAttribute("data-kind", "counter"));
  await demo.locator("[data-policy-reset]").click();
  await expect(demo.locator("[data-policy-error]")).toBeHidden();
  await expect(demo.locator("[data-policy-left]")).toHaveText(["0", "0", "0"]);
});

test("comparisons preserve their outcomes across motion preferences and screen widths", async ({ page }) => {
  for (const reducedMotion of ["no-preference", "reduce"] as const) {
    await page.emulateMedia({ reducedMotion });
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const example of examples) {
        await page.goto(`/structures/${example.slug}/`);
        const demo = page.getByTestId(`${example.kind}-policy-comparison`);
        await demo.locator("[data-policy-advance]").click();
        await demo.locator("[data-policy-reset]").click();
        await expect(demo).toHaveAttribute("data-phase", "0");
        await demo.locator("[data-policy-advance]").click();
        await demo.locator("[data-policy-advance]").click();
        await expect(demo.locator("[data-policy-right]")).toHaveText(Array(3).fill(example.right));
        expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
        if (reducedMotion === "no-preference") {
          await demo.screenshot({ path: `test-results/${example.kind}-policy-${width}.png` });
        }
      }
    }
  }
});
