import { expect, test, type Locator } from "@playwright/test";

async function stageAndDeliver(demo: Locator, reverse = false) {
  await demo.locator("[data-order]").selectOption(reverse ? "reverse" : "forward");
  const stage = demo.locator('[data-action="stage"]');
  await stage.focus();
  await stage.press("Enter");
  await expect(stage).toBeFocused();
  await expect(demo).toHaveAttribute("data-stage", "staged");
  const deliver = demo.locator('[data-action="deliver"]');
  await deliver.focus();
  await deliver.press("Enter");
  await expect(deliver).toBeFocused();
  await expect(demo).toHaveAttribute("data-stage", "delivered");
}

test("native move/field composition retains target in both orders; stale-index toy does not", async ({ page }) => {
  await page.goto("/structures/sequence-crdt/");
  const demo = page.getByTestId("sequence-move-comparison");
  await expect(demo).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("sequence-crdt-demo")).toBeVisible();
  for (const reverse of [false, true]) {
    for (const path of ["toy", "native"]) {
      await expect(demo.locator(`[data-path="${path}"] [data-value]`)).toHaveText(Array(9).fill("open"));
    }
    await stageAndDeliver(demo, reverse);
    const native = demo.locator('[data-path="native"]');
    for (const id of ["A", "B", "C"]) {
      const client = native.locator(`[data-client="${id}"]`);
      await expect(client.locator("[data-record-id] code")).toHaveText(["0: weir", "1: bridge", "2: north-gate"]);
      await expect(client.locator("[data-value]")).toHaveText(["blocked", "open", "open"]);
      await expect(client.locator("[data-target]")).toContainText("current index: 0");
    }
    const toy = demo.locator('[data-path="toy"]');
    await expect(toy.locator('[data-client="A"] [data-target]')).toHaveAttribute("data-target-id", "bridge");
    await expect(toy.locator('[data-client="B"] [data-target]')).toHaveAttribute("data-target-id", "weir");
    await expect(toy.locator('[data-client="C"] [data-target]')).toHaveAttribute("data-target-id", reverse ? "weir" : "bridge");
    await expect(demo.locator("[data-error]")).toBeHidden();
    await demo.locator("summary").click();
    await expect(demo.locator("[data-evidence]")).toContainText("native operation: Move");
    await expect(demo.locator("[data-evidence]")).toContainText('Set(key: "weir"');
    await demo.locator('[data-action="reset"]').click();
    await expect(demo).toHaveAttribute("data-stage", "ready");
    await expect(demo.locator("[data-order]")).toHaveValue("forward");
  }
});

test("matched native text paths share inputs, converge, expose transformed log, and reset", async ({ page }) => {
  await page.goto("/structures/text-crdt/");
  const demo = page.getByTestId("text-mechanism-comparison");
  await expect(demo).toHaveAttribute("data-ready", "true");
  await expect(page.getByTestId("naive-text-merge-demo")).toBeVisible();
  await expect(page.getByTestId("text-crdt-demo")).toBeVisible();
  await expect(demo.locator("[data-input]")).toHaveText([
    "The weir is clear.", 'Alice: insert(4, "still ")', 'Bob: insert(4, "calm ")',
  ]);
  for (const reverse of [false, true]) {
    await expect(demo.locator("[data-value]")).toHaveText(Array(6).fill("The weir is clear."));
    await demo.locator("[data-order]").selectOption(reverse ? "reverse" : "forward");
    await demo.locator('[data-action="stage"]').click();
    for (const path of ["crdt", "ot"]) {
      await expect(demo.locator(`[data-path="${path}"] [data-value]`)).toHaveText([
        "The still weir is clear.", "The calm weir is clear.", "The weir is clear.",
      ]);
    }
    await demo.locator('[data-action="deliver"]').click();
    await expect(demo.locator('[data-path="crdt"] [data-value]')).toHaveText(Array(3).fill("The still calm weir is clear."));
    await expect(demo.locator('[data-path="ot"] [data-value]')).toHaveText(Array(3).fill(reverse ? "The calm still weir is clear." : "The still calm weir is clear."));
    await expect(demo.locator("[data-converged]")).toHaveCount(2);
    await expect(demo.locator('[data-converged="true"]')).toHaveCount(2);
    await expect(demo.locator("[data-evidence]")).toContainText("reference=0");
    await expect(demo.locator("[data-evidence]")).toContainText(reverse ? '[{"retain":9},{"insert":"still "}]' : '[{"retain":10},{"insert":"calm "}]');
    await expect(demo.locator("[data-error]")).toBeHidden();
    await demo.locator('[data-action="reset"]').click();
    await expect(demo).toHaveAttribute("data-stage", "ready");
    await expect(demo.locator("[data-order]")).toHaveValue("forward");
  }
});

test("both comparisons have readable static states and disabled controls without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  for (const [route, id] of [["sequence-crdt", "sequence-move-comparison"], ["text-crdt", "text-mechanism-comparison"]]) {
    await page.goto(`/structures/${route}/`);
    const demo = page.getByTestId(id);
    await expect(demo).not.toHaveAttribute("data-ready");
    await expect(demo.locator("[data-client]")).toHaveCount(6);
    await expect(demo.locator("[data-enhancement]")).toBeVisible();
    for (const button of await demo.locator("button").all()) await expect(button).toBeDisabled();
    await expect(demo.locator("select")).toBeDisabled();
  }
  await context.close();
});

for (const example of [
  { route: "sequence-crdt", id: "sequence-move-comparison", result: '[data-path="native"] [data-value]', expected: Array(3).fill(["blocked", "open", "open"]).flat() },
  { route: "text-crdt", id: "text-mechanism-comparison", result: "[data-value]", expected: Array(6).fill("The still calm weir is clear.") },
]) {
  test(`${example.id} agrees before hydration and after reset, with a two-action result`, async ({ browser, page }) => {
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    try {
      const staticPage = await staticContext.newPage();
      await staticPage.goto(`/structures/${example.route}/`);
      const staticDemo = staticPage.getByTestId(example.id);
      const initialValues = await staticDemo.locator("[data-value]").allTextContents();
      const recordMetadata = (demo: Locator) => demo.locator("[data-record-id], [data-target-id]").evaluateAll((nodes) =>
        nodes.map((node) => [node.getAttribute("data-record-id"), node.getAttribute("data-index"), node.getAttribute("data-target-id")]));
      const initialRecords = await recordMetadata(staticDemo);
      await page.goto(`/structures/${example.route}/`);
      const demo = page.getByTestId(example.id);
      await expect(demo).toHaveAttribute("data-ready", "true");
      await expect(demo.locator("[data-value]")).toHaveText(initialValues);
      expect(await recordMetadata(demo)).toEqual(initialRecords);
      await demo.locator('[data-action="stage"]').click();
      await demo.locator('[data-action="reset"]').click();
      await expect(demo.locator("[data-value]")).toHaveText(initialValues);
      expect(await recordMetadata(demo)).toEqual(initialRecords);
      let actions = 0;
      for (const action of ["stage", "deliver"]) {
        await demo.locator(`[data-action="${action}"]`).click();
        actions += 1;
      }
      expect(actions).toBeLessThanOrEqual(3);
      await expect(demo.locator(example.result)).toHaveText(example.expected);
      await demo.locator('[data-action="reset"]').click();
      await expect(demo.locator("[data-value]")).toHaveText(initialValues);
      expect(await recordMetadata(demo)).toEqual(initialRecords);
    } finally {
      await staticContext.close();
    }
  });
}

test("a rejected native action shows an alert without replacing the last valid view", async ({ page }) => {
  for (const [route, id] of [["sequence-crdt", "sequence-move-comparison"], ["text-crdt", "text-mechanism-comparison"]]) {
    await page.goto(`/structures/${route}/`);
    const demo = page.getByTestId(id);
    await expect(demo).toHaveAttribute("data-ready", "true");
    await demo.locator('[data-action="stage"]').click();
    const before = await demo.locator("[data-value]").allTextContents();
    await demo.evaluate((element) => {
      const enhanced = element as HTMLElement & { current: { room: object } };
      enhanced.current.room = {};
    });
    await demo.locator('[data-action="deliver"]').click();
    await expect(demo.locator("[data-error]")).toBeVisible();
    await expect(demo.locator("[data-error]")).toHaveAttribute("role", "alert");
    await expect(demo).toHaveAttribute("data-stage", "staged");
    expect(await demo.locator("[data-value]").allTextContents()).toEqual(before);
    await demo.locator('[data-action="reset"]').click();
    await expect(demo.locator("[data-error]")).toBeHidden();
    await expect(demo).toHaveAttribute("data-stage", "ready");
  }
});

test("desktop and mobile comparison instruments stay within the viewport", async ({ page }) => {
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (const [route, id] of [["sequence-crdt", "sequence-move-comparison"], ["text-crdt", "text-mechanism-comparison"]]) {
      await page.goto(`/structures/${route}/`);
      const demo = page.getByTestId(id);
      await expect(demo).toHaveAttribute("data-ready", "true");
      await stageAndDeliver(demo);
      await demo.locator("summary").click();
      await expect(demo.locator("[data-evidence]")).toBeVisible();
      expect(await demo.locator("[data-evidence] pre").evaluateAll((elements) =>
        elements.every((element) => getComputedStyle(element).whiteSpace === "pre-wrap"))).toBe(true);
      expect(await demo.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left >= -1 && bounds.right <= window.innerWidth + 1 && element.scrollWidth <= element.clientWidth + 1;
      })).toBe(true);
      await demo.locator("summary").click();
      await demo.screenshot({ path: `test-results/${id}-${width}.png` });
    }
  }
});
