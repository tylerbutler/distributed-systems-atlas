import { expect, test } from "@playwright/test";
import type { LabAction, Observation, SimulationEngine, TraceFrame } from "../src/lib/lab/contract";
import type { LabPresentation } from "../src/lib/lab/present-frame";

const specimens: Array<{ record: Observation; label: string; value: string }> = [
  { record: { observation: "history", events: [{ id: "a1", predecessors: [] }], observed: ["a1"] },
    label: "Local history", value: "a1" },
  { record: { observation: "scalar-clock", clock: 3 }, label: "Scalar clock", value: "3" },
  { record: { observation: "vector-clock", clock: { A: 1, B: 2 } }, label: "Clock", value: "A:1, B:2" },
  { record: { observation: "mv-register", siblings: [
    { value: "red", version: { A: 1 } }, { value: "red", version: { B: 1 } },
  ], context: { A: 1, B: 1 } }, label: "Register siblings", value: "red [A:1]; red [B:1]" },
  { record: { observation: "or-set", members: [
    { value: "beacon", dots: [{ replica: "B", counter: 1 }], removed: [{ replica: "A", counter: 1 }] },
  ], context: { A: 1, B: 1 } }, label: "Set membership", value: "beacon [B:1]" },
];

for (const { record, label, value } of specimens) {
  test(`shared element renders ${record.observation} records and typed controls`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/atlas/dots-and-causal-context/");
    const lab = page.getByTestId("causal-lab");
    await expect(lab.getByRole("button", { name: "Reset lab" })).toBeVisible();
    // Static records exercise the renderer without implementing a future engine.
    await lab.evaluate((element, observation) => {
      const frame: TraceFrame = {
        index: 0, action: null, actionLabel: "initial", explanation: "Specimen explanation.",
        replicas: [{ id: "A", value: ["sample"], ...observation }],
        messages: [{ id: "m1:A:B", from: "A", to: "B", kind: "event", ...observation }],
        partitions: [], invariants: { valid: true },
      };
      const engine: SimulationEngine = {
        current: () => frame,
        history: () => [frame],
        dispatch: (action) => ({ action, engine: "specimen", message: "Specimen is read-only.", lastFrame: frame }),
      };
      const action: LabAction = observation.observation === "mv-register"
        ? { type: "write", replica: "A", value: "green" }
        : observation.observation === "or-set"
          ? { type: "add", replica: "A", value: "beacon" }
          : { type: "local-event", replica: "A" };
      const presentation: LabPresentation = {
        title: "Specimen lab", instructions: "Inspect algorithm metadata.",
        comparisonHeading: "Event comparison", inspectorNote: "Specimen records.",
        invariantLabels: { valid: "Valid observation" },
        valueLabel: (replica) => replica.value.join(", "),
        controls: () => [
          { kind: "action", label: "Record at A", action, reason: "" },
          { kind: "notice", text: "Only local knowledge is shown." },
        ],
        compare: () => null, announce: () => "",
        complete: () => ({ heading: "Specimen outcome", explanation: "Independent of a comparison." }),
      };
      const parent = element.parentElement!;
      element.remove();
      Object.assign(element, { engine, presentation });
      parent.append(element);
    }, record);
    const replica = lab.getByRole("region", { name: "Replica A", exact: true });
    await expect(replica.locator("dt")).toContainText(["Visible value", label]);
    await expect(replica.locator("dd")).toContainText(["sample", value]);
    await expect(replica).not.toContainText("Live dots");
    await expect(lab.getByRole("region", { name: "Queued messages" })).toContainText(value);
    await expect(lab.locator(".lab-explanation").getByText("Specimen explanation.", { exact: true })).toBeVisible();
    await expect(lab.getByText("Specimen outcome", { exact: true })).toBeVisible();
    await expect(lab.getByText("Only local knowledge is shown.", { exact: true })).toBeVisible();
    await expect(lab.getByRole("region", { name: "Event comparison" })).toBeHidden();
    await lab.getByRole("button", { name: "Inspect m1:A:B", exact: true }).click();
    await expect(lab.locator('details[data-inspector="message"]')).toContainText(`"observation": "${record.observation}"`);
    await lab.getByRole("button", { name: "Record at A", exact: true }).evaluate((button) => {
      button.textContent = "Changed visible label";
    });
    await lab.getByRole("button", { name: "Changed visible label", exact: true }).click();
    await expect(lab.getByRole("alert")).toContainText("Specimen is read-only.");
    const actionType = record.observation === "mv-register" ? "write"
      : record.observation === "or-set" ? "add" : "local-event";
    await expect(lab.getByRole("alert")).toContainText(`"type":"${actionType}"`);
    await expect(replica).toContainText(value);
    await expect(lab.getByRole("status")).toBeEmpty();
  });
}
