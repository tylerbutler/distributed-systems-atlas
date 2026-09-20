import { expect, test } from "@playwright/test";

test("landing page works without client JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "Distributed systems",
  );
  await expect(page.getByRole("link", { name: "Open the atlas" })).toBeVisible();
});
