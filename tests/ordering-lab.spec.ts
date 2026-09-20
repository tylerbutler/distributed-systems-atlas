import { expect, test } from "@playwright/test";
import { acceptanceFixtures } from "../src/lib/lab/fixtures";
import { presentFrame } from "../src/lib/lab/present-frame";
import { scenarioById, scenarioTrace } from "../src/lib/lab/scenarios";

for (const width of [390, 1280]) {
  for (const fixture of acceptanceFixtures.slice(0, 4)) {
    test(`${fixture.id} runs in the shared lab at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/atlas/dots-and-causal-context/");
      await expect(page.getByTestId("causal-lab").getByRole("button", { name: "Reset lab" })).toBeVisible();
      await page.getByTestId("causal-lab").evaluate((original, id) => {
        const lab = document.createElement("causal-lab");
        lab.setAttribute("scenario", id);
        lab.setAttribute("data-testid", "ordering-lab");
        original.replaceWith(lab);
      }, fixture.id);
      const lab = page.getByTestId("ordering-lab");
      const scenario = scenarioById(fixture.id);
      const trace = scenarioTrace(fixture.id);
      const expected = presentFrame(trace.at(-1)!, trace, scenario.presentation);
      for (const [index, action] of (scenario.actions ?? []).entries()) {
        await lab.getByRole("button", { name: `Reference step ${index + 1}: ${action.type}`, exact: true }).click();
        await expect(lab.getByRole("alert")).toBeHidden();
      }
      await expect(lab.locator(".lab-explanation h3")).toHaveText(expected.outcome!.heading);
      for (const replica of expected.replicas) {
        await expect(lab.getByRole("region", { name: `Replica ${replica.id}`, exact: true }).locator("dd"))
          .toHaveText(replica.details.map((detail) => detail.value));
      }
      for (const control of expected.controls) {
        if (control.kind === "notice") {
          await expect(lab.getByRole("region", { name: "Lesson controls", exact: true })
            .getByText(control.text, { exact: true })).toBeVisible();
        }
      }
      expect(await lab.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
      await lab.getByRole("button", { name: "Reset lab", exact: true }).click();
      await expect(lab.locator(".lab-explanation h3")).toHaveCount(0);
      await expect(lab.getByRole("button", { name: `Reference step 1: ${scenario.actions![0].type}`, exact: true })).toBeEnabled();
    });
  }
}
