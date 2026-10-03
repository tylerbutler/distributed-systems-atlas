import { expect, test, type WebSocketRoute } from "@playwright/test";
import { MAX_SHARED_AMOUNT } from "../worker/shared-counter-protocol";

const epoch = "9df10f6c-c764-46d8-a3c8-54eec6227005";
const nextEpoch = "349ba5f0-6e57-4a9f-bb4c-f4f2712c1c30";

test("native optimistic edits use numbered signed echoes once and recover missing operations", async ({ page }) => {
  let connection: WebSocketRoute | undefined;
  const sent: Array<{ type: string; epoch: string; id?: string; amount?: number; after?: number }> = [];
  await page.routeWebSocket(/\/rooms\/shared-counter\/EAGLE7$/, (socket) => {
    connection = socket;
    socket.onMessage((raw) => sent.push(JSON.parse(String(raw))));
    socket.send(JSON.stringify({ type: "hello", room: "EAGLE7", replica: "A", connected: 3, epoch, operations: [] }));
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/shared-counter/?room=EAGLE7");
  const demo = page.getByTestId("shared-counter-demo");
  const totals = demo.locator("[data-shared-total]");
  const broadcast = demo.getByRole("checkbox", { name: "Broadcast" });
  await expect(demo.getByRole("button", { name: "Send +3 for Alice" })).toBeEnabled();
  await expect(demo.getByRole("button", { name: "Send -1 for Bob" })).toBeDisabled();
  await expect(demo.getByRole("button", { name: "Race Alice +3 and Bob -1" })).toBeDisabled();
  await broadcast.uncheck();
  await demo.getByRole("button", { name: "Send +3 for Alice" }).click();
  await demo.getByRole("button", { name: "Send +1 for Alice" }).click();
  await expect(totals).toHaveText(["14", "10", "10"]);
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 0");
  expect(sent).toHaveLength(2);
  expect(sent[0]).toEqual({ type: "increment", epoch, id: expect.any(String), amount: 3 });
  if (!connection) throw new Error("The room did not connect.");
  const first = { id: sent[0].id, sequenceNumber: 1, author: "A", amount: 3 };
  const second = { id: sent[1].id, sequenceNumber: 2, author: "A", amount: 1 };
  const third = { id: crypto.randomUUID(), sequenceNumber: 3, author: "B", amount: -1 };
  connection.send(JSON.stringify({ type: "operation", epoch, operation: first }));
  connection.send(JSON.stringify({ type: "operation", epoch, operation: third }));
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 1");
  await expect.poll(() => sent.at(-1)).toEqual({ type: "history", epoch, after: 1 });
  connection.send(JSON.stringify({ type: "history", epoch, operations: [second, third] }));
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 3");
  await broadcast.check();
  await expect(totals).toHaveText(["13", "13", "13"]);
  connection.send(JSON.stringify({ type: "operation", epoch, operation: third }));
  await expect(totals).toHaveText(["13", "13", "13"]);
  await expect(demo.getByRole("list", { name: "Sequenced operation log" }).getByRole("listitem"))
    .toHaveText(["SN 3 · Bob -1", "SN 2 · Alice +1", "SN 1 · Alice +3"]);

  await broadcast.uncheck();
  await demo.getByRole("button", { name: "Send +3 for Alice" }).click();
  await expect(totals).toHaveText(["16", "13", "13"]);
  connection.send(JSON.stringify({
    type: "error", epoch, operations: [first, second, third], message: "The room rejected this edit.",
  }));
  await expect(totals).toHaveText(["13", "13", "13"]);
  await expect(demo.locator("[data-room-status]")).toContainText("unconfirmed local changes were discarded");
  connection.send(JSON.stringify({ type: "reset", epoch: nextEpoch, operations: [] }));
  await expect(totals).toHaveText(["10", "10", "10"]);
  connection.send(JSON.stringify({ type: "operation", epoch, operation: third }));
  await expect(totals).toHaveText(["10", "10", "10"]);
  connection.close({ code: 1000 });
  await expect(demo.getByRole("button", { name: "Send +1 for Alice" })).toBeDisabled();
  await expect(demo.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await demo.getByRole("button", { name: "Leave room" }).click();
  await expect(demo.getByRole("button", { name: "Send +1 for Alice" })).toBeEnabled();
});

test("observers restore the real ordered log but cannot send or reset", async ({ page }) => {
  await page.routeWebSocket(/\/rooms\/shared-counter\/EAGLE7$/, (socket) => {
    socket.send(JSON.stringify({
      type: "hello", room: "EAGLE7", replica: null, connected: 4, epoch,
      operations: [
        { id: crypto.randomUUID(), sequenceNumber: 1, author: "A", amount: 3 },
        { id: crypto.randomUUID(), sequenceNumber: 2, author: "B", amount: -1 },
      ],
    }));
  });
  await page.goto("/structures/shared-counter/?room=EAGLE7");
  const demo = page.getByTestId("shared-counter-demo");
  await expect(demo.locator("[data-shared-total]")).toHaveText(["12", "12", "12"]);
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 2");
  await expect(demo.getByRole("button", { name: "Send +1 for Alice" })).toBeDisabled();
  await expect(demo.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
});

test("the largest permitted log remains readable without document overflow", async ({ page }) => {
  await page.routeWebSocket(/\/rooms\/shared-counter\/EAGLE7$/, (socket) => {
    socket.send(JSON.stringify({
      type: "hello", room: "EAGLE7", replica: "A", connected: 1, epoch,
      operations: Array.from({ length: 1000 }, (_, index) => ({
        id: crypto.randomUUID(), sequenceNumber: index + 1, author: "C", amount: MAX_SHARED_AMOUNT,
      })),
    }));
  });
  await page.goto("/structures/shared-counter/?room=EAGLE7");
  const demo = page.getByTestId("shared-counter-demo");
  const value = String(10 + MAX_SHARED_AMOUNT * 1000);
  await expect(demo.locator("[data-shared-total]")).toHaveText([value, value, value]);
  await expect(demo.getByLabel("Latest sequence number")).toHaveText("SN 1000");
  await expect(demo.getByRole("button", { name: "Send +1 for Alice" })).toBeDisabled();
  await expect(demo.getByRole("button", { name: "Reset", exact: true })).toBeEnabled();
  await expect(demo.locator("[data-room-status]")).toContainText("1,000 operations");
  for (const width of [320, 390, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
  }
});
