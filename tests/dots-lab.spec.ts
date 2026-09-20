import { expect, test } from "@playwright/test";

test("steps through concurrent add and remove", async ({ page }) => {
  await page.goto("/lab-test/");
  const lab = page.getByTestId("causal-lab");
  const a = lab.getByRole("region", { name: "Replica A", exact: true });
  const b = lab.getByRole("region", { name: "Replica B", exact: true });

  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true }).click();
  await lab.getByRole("button", { name: "Partition A and B", exact: true }).click();
  await lab.getByRole("button", { name: "Remove beacon at A", exact: true }).click();
  await lab.getByRole("button", { name: "Add beacon at B", exact: true }).click();
  await lab.getByRole("button", { name: "Heal A and B", exact: true }).click();

  // Heal restores the link; it does not deliver either queued delta.
  await expect(a.getByText("Empty set", { exact: true })).toBeVisible();
  await expect(b.getByText("A:1, B:1", { exact: true }).first()).toBeVisible();
  await expect(lab.getByRole("button", { name: /^Deliver / })).toHaveCount(2);
  await expect(lab.getByText("A:2", { exact: true })).toHaveCount(0);
  await expect(lab.getByText("The new B dot survives", { exact: true })).toHaveCount(0);

  await lab.getByRole("button", { name: "Deliver m2 from A to B", exact: true }).click();
  await lab.getByRole("button", { name: "Deliver m3 from B to A", exact: true }).click();
  for (const replica of [a, b]) {
    await expect(replica.getByText("beacon", { exact: true })).toBeVisible();
    await expect(replica.getByText("B:1", { exact: true })).toBeVisible();
    await expect(replica.getByText("A:1, B:1", { exact: true })).toHaveCount(2);
  }
  await expect(lab.getByText("The new B dot survives", { exact: true })).toBeVisible();
  await expect(lab.getByText("Converged: yes", { exact: true })).toBeVisible();
  await expect(lab.getByRole("region", { name: "Event ledger" }).getByRole("listitem")).toHaveCount(9);
});

test("shows the static initial state without JavaScript", async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto("/lab-test/");
    await expect(page.getByText("Initial replica state", { exact: true })).toBeVisible();
    await expect(page.getByText("No events observed", { exact: true })).toHaveCount(2);
    await expect(page.getByRole("region", { name: /^Replica / })).toHaveCount(2);
    await expect(page.getByText(/article remains readable/)).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  } finally {
    await context.close();
  }
});

test("duplicates and reorders queued messages, browses history, and resets", async ({ page }) => {
  await page.goto("/lab-test/");
  const lab = page.getByTestId("causal-lab");
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await lab.getByRole("button", { name: "Duplicate m1 from A to B", exact: true }).click();
  await lab.getByRole("button", { name: "Deliver m1 copy1 from A to B", exact: true }).click();
  await lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true }).click();
  await expect(lab.getByText("Converged: yes", { exact: true })).toBeVisible();
  await lab.getByRole("button", { name: "Previous frame", exact: true }).click();
  await expect(lab.getByText("Frame 3 of 4", { exact: true })).toBeVisible();
  await expect(lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true })).toBeDisabled();
  await expect(lab.getByRole("button", { name: "Add beacon at A", exact: true })).toBeDisabled();
  await expect(lab.getByText(/Return to the latest frame to change state/)).toBeVisible();
  await lab.getByRole("button", { name: "Next frame", exact: true }).click();
  await expect(lab.getByText("No queued messages", { exact: true })).toBeVisible();
  await lab.getByRole("button", { name: "Reset lab", exact: true }).click();
  await expect(lab.getByText("Frame 0 of 0", { exact: true })).toBeVisible();
  await expect(lab.getByText("No events observed", { exact: true })).toHaveCount(2);
  await expect(lab.getByRole("region", { name: "Event ledger" }).getByRole("listitem")).toHaveCount(1);
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await expect(lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true })).toBeEnabled();
});

test("disables blocked delivery and preserves the last valid views on LabError", async ({ page }) => {
  await page.goto("/lab-test/");
  const lab = page.getByTestId("causal-lab");
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await lab.getByRole("button", { name: "Partition A and B", exact: true }).click();
  const deliver = lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true });
  await expect(deliver).toBeDisabled();
  await expect(deliver).toHaveAccessibleDescription(/active partition/);
  const replicas = await lab.getByRole("region", { name: /^Replica / }).allTextContents();
  const messages = await lab.getByRole("region", { name: "Queued messages" }).innerText();

  // Exercise the real engine rejection behind the disabled affordance (a stale action).
  await deliver.evaluate((button: HTMLButtonElement) => {
    button.disabled = false;
    button.click();
  });
  const alert = lab.getByRole("alert");
  await expect(alert).toContainText("deliver");
  await expect(alert).toContainText("m1:A:B");
  await expect(alert).toContainText("dots-concurrent-add-remove");
  await expect(alert).toContainText("message crosses an active partition");
  await expect(alert).toContainText("Last valid frame: 2");
  expect(await lab.getByRole("region", { name: /^Replica / }).allTextContents()).toEqual(replicas);
  expect(await lab.getByRole("region", { name: "Queued messages" }).innerText()).toEqual(messages);
  await expect(lab.getByText("Frame 2 of 2", { exact: true })).toBeVisible();
  await expect(lab.getByRole("region", { name: "Invariant checks" })).toBeHidden();
  await expect(lab.getByRole("status")).toBeEmpty();
  // Presentation changes cannot clear an engine error or restore successful checks.
  await alert.evaluate((element) => element.setAttribute("hidden", ""));
  await lab.getByRole("button", { name: "Previous frame", exact: true }).click();
  await expect(alert).toBeVisible();
  await expect(lab.getByRole("region", { name: "Invariant checks" })).toBeHidden();
  await lab.getByRole("button", { name: "Next frame", exact: true }).click();
  await lab.getByRole("button", { name: "Heal A and B", exact: true }).click();
  await expect(alert).toBeHidden();
  await lab.getByRole("button", { name: "Deliver m1 from A to B", exact: true }).click();
  await expect(lab.getByText("Converged: yes", { exact: true })).toBeVisible();
});

test("reports invalid and missing scenarios without a success-shaped fallback", async ({ page }) => {
  await page.goto("/lab-test/");
  await expect(page.getByRole("button", { name: "Reset lab" })).toBeVisible();
  for (const scenario of ["not-a-scenario", null]) {
    await page.evaluate((value) => {
      const lab = document.createElement("causal-lab");
      if (value !== null) lab.setAttribute("scenario", value);
      const fallback = document.createElement("p");
      fallback.textContent = "Static state remains readable";
      lab.append(fallback);
      document.querySelector("main")!.replaceChildren(lab);
    }, scenario);
    await expect(page.getByRole("alert")).toContainText(
      scenario ? "Unknown lab scenario: not-a-scenario" : "Missing required scenario attribute",
    );
    await expect(page.getByText("Static state remains readable", { exact: true })).toBeVisible();
    await expect(page.getByRole("button")).toHaveCount(0);
  }
});

test("reconnecting the element retains its trace without duplicate handlers", async ({ page }) => {
  await page.goto("/lab-test/");
  const lab = page.getByTestId("causal-lab");
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await lab.evaluate((element) => {
    const parent = element.parentElement!;
    element.remove();
    parent.append(element);
  });
  await expect(lab.getByText("Frame 1 of 1", { exact: true })).toBeVisible();
  await lab.getByRole("button", { name: "Add beacon at A", exact: true }).click();
  await expect(lab.getByText("Frame 2 of 2", { exact: true })).toBeVisible();
  await expect(lab.getByRole("region", { name: "Replica A", exact: true }).getByText("A:1, A:2", { exact: true })).toBeVisible();
});
