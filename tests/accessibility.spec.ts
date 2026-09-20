import { expect, test, type Locator, type Page } from "@playwright/test";

async function tabTo(page: Page, target: Locator): Promise<void> {
  // Bound traversal by the actual page, not a stale number of preceding links.
  const limit = await page.locator("a[href], button, summary, input, select, textarea, [tabindex]").count();
  for (let step = 0; step <= limit; step++) {
    if (await target.evaluate((element) => element === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  await expect(target).toBeFocused();
}

test("history delivery descriptions explain the return-to-latest restriction", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  const lab = page.getByTestId("causal-lab");
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await lab.getByRole("button", { name: "Partition A and B", exact: true }).click();
  await lab.getByRole("button", { name: "Heal A and B", exact: true }).click();
  const deliver = lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true });
  for (let step = 0; step < 2; step++) {
    await lab.getByRole("button", { name: "Back", exact: true }).click();
    await expect(deliver).toBeDisabled();
    await expect(deliver).toHaveAccessibleDescription(/Return to the latest frame to change state/);
  }
  await lab.getByRole("button", { name: "Forward", exact: true }).click();
  await lab.getByRole("button", { name: "Forward", exact: true }).click();
  await expect(deliver).toBeEnabled();
  await expect(deliver).toHaveAccessibleDescription("Ready for delivery");
});

test("lab controls work by keyboard and keep focus through updates", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  const add = page.getByRole("button", { name: "Add beacon at A", exact: true });
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("main")).toBeFocused();
  await tabTo(page, add);
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("status")).toContainText("A created dot A:1");
  await expect(add).toBeFocused();
  await expect(add).toHaveCSS("outline-style", "solid");
  await expect(add).toHaveCSS("outline-width", "3px");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Remove beacon at A", exact: true })).toBeFocused();
  await page.keyboard.press("Space");
  await expect(page.getByRole("status")).toContainText("Removed 1 observed dots");
  const deliver = page.getByRole("button", { name: "Deliver m1 from A to B", exact: true });
  await tabTo(page, deliver);
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Queued messages" })).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "Inspect m2:A:B", exact: true }));
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Inspect m2:A:B", exact: true })).toBeFocused();
  await tabTo(page, page.getByRole("button", { name: "Back", exact: true }));
  await page.keyboard.press("Enter");
  await tabTo(page, page.getByRole("button", { name: "Frame 3: deliver m1:A:B", exact: true }));
  await page.keyboard.press("Enter");
  const inspector = page.getByRole("region", { name: "State inspector" });
  await tabTo(page, inspector.locator("summary").first());
  await page.keyboard.press("Enter");
  await expect(inspector.locator("details").first()).toHaveAttribute("open", "");
  await tabTo(page, page.locator(".sheet-references").getByRole("link").first());
  const related = page.getByRole("navigation", { name: "Related sheets", exact: true });
  await expect(related).toContainText("No related sheets");
  await expect(related.getByRole("link")).toHaveCount(0);
  await expect(page.getByRole("navigation", { name: "Next trail step" })).toContainText("Planned");
});

test("reduced motion Play advances exactly one recorded frame and preference changes stop playback", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/atlas/dots-and-causal-context/");
  const lab = page.getByTestId("causal-lab");
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await lab.getByRole("button", { name: "Add beacon at B", exact: true }).click();
  await lab.getByRole("button", { name: "Frame 0: initial", exact: true }).click();
  await page.clock.install({ time: new Date(0) });
  await page.clock.pauseAt(new Date(1000));
  await lab.getByRole("button", { name: "Next recorded frame", exact: true }).click();
  await page.clock.runFor(2700);
  await expect(lab.getByText("Frame 1 of 2", { exact: true })).toBeVisible();
  await expect(lab.getByRole("status")).toContainText("A created dot A:1");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await lab.getByRole("button", { name: "Play", exact: true }).click();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(lab.getByRole("button", { name: "Next recorded frame", exact: true })).toBeVisible();
  await page.clock.runFor(2700);
  await expect(lab.getByText("Frame 1 of 2", { exact: true })).toBeVisible();
});

test("reduced motion disables transition animation and responds to preference changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/atlas/dots-and-causal-context/");
  const lab = page.getByTestId("causal-lab");
  await expect(lab).toHaveAttribute("data-motion", "reduced");
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await expect(lab.getByRole("status")).toContainText("A created dot A:1");
  expect(await lab.evaluate((element) => [element, ...element.querySelectorAll("*")].every((node) => {
    const style = getComputedStyle(node);
    return style.animationName === "none" && style.transitionDuration === "0s";
  }))).toBe(true);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(lab).toHaveAttribute("data-motion", "full");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(lab).toHaveAttribute("data-motion", "reduced");
});

test("replicas reflow without overflow and message paths do not depend on color", async ({ page }) => {
  await page.goto("/atlas/dots-and-causal-context/");
  const lab = page.getByTestId("causal-lab");
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  const path = lab.locator(".lab-message");
  await expect(path).toHaveCSS("border-top-style", "solid");
  await lab.getByRole("button", { name: "Partition A and B", exact: true }).click();
  await expect(path).toHaveCSS("border-top-style", "dashed");
  await expect(path).toContainText("Blocked by active partition");
  for (const width of [320, 767, 769, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    const a = await lab.getByRole("region", { name: "Replica A", exact: true }).boundingBox();
    const b = await lab.getByRole("region", { name: "Replica B", exact: true }).boundingBox();
    if (!a || !b) throw new Error("Replica views are missing");
    if (width >= 672) expect(a.y).toBe(b.y);
    else expect(b.y).toBeGreaterThan(a.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
