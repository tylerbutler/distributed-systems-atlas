import { expect, test } from "@playwright/test";

for (const [path, testId, outbound, broadcast] of [
  ["/structures/shared-counter/", "shared-counter-demo", ".shared-operation-pulse.outbound", ".shared-operation-pulse.sequenced"],
  ["/structures/pn-counter/", "pn-counter-demo", ".pn-operation-pulse.outbound", ".pn-operation-pulse.sequenced"],
  ["/structures/g-set/", "g-set-demo", ".set-operation-pulse.outbound", ".set-operation-pulse.shared"],
  ["/structures/lww-register/", "lww-register-demo", ".register-operation-pulse.outbound", ".register-operation-pulse.shared"],
  ["/structures/shared-map/", "shared-map-demo", ".map-operation-pulse.outbound", ".map-operation-pulse.shared"],
  ["/structures/shared-sequence/", "shared-sequence-demo", ".remaining-operation-pulse.outbound", ".remaining-operation-pulse.shared"],
] as const) {
  test(`${testId} broadcasts queued operations together`, async ({ page }) => {
    await page.goto(path);
    const demo = page.getByTestId(testId);
    await demo.locator("[data-transport-auto-deliver]").uncheck();
    await demo.locator('[data-action="race"]').click();
    await expect(demo.locator(outbound)).toHaveCount(2);
    await expect(demo.locator(outbound)).toHaveCount(0);
    await demo.locator("[data-transport-auto-deliver]").check();
    await expect(demo.locator(broadcast)).toHaveCount(6);
    await expect(demo.locator(broadcast)).toHaveCount(0);
  });
}
