import { expect, test } from "@playwright/test";

test("lab controls work by keyboard and keep focus through updates", async ({ page }) => {
  await page.goto("/lab-test/");
  const add = page.getByRole("button", { name: "Add beacon at A", exact: true });
  await page.keyboard.press("Tab");
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
  await deliver.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Queued messages" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Deliver m2 from A to B", exact: true })).toBeFocused();
});

test("reduced motion disables transition animation and responds to preference changes", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/lab-test/");
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
  await page.goto("/lab-test/");
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
    if (width > 768) expect(a.y).toBe(b.y);
    else expect(b.y).toBeGreaterThan(a.y);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
