import { expect, test, type WebSocketRoute } from "@playwright/test";

const epoch = "9df10f6c-c764-46d8-a3c8-54eec6227005";
const nextEpoch = "349ba5f0-6e57-4a9f-bb4c-f4f2712c1c30";

test("room counts update before confirmation and merge echoed state once", async ({ page }) => {
  let connection: WebSocketRoute | undefined;
  const sent: unknown[] = [];
  await page.routeWebSocket(/\/rooms\/EAGLE7$/, (socket) => {
    connection = socket;
    socket.onMessage((message) => sent.push(JSON.parse(String(message))));
    socket.send(JSON.stringify({
      type: "hello", room: "EAGLE7", replica: "A", connected: 3,
      state: { epoch, counts: { A: 0, B: 0, C: 0 } },
    }));
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/structures/g-counter/?room=EAGLE7");
  const demo = page.getByTestId("g-counter-demo");
  const totals = demo.locator("[data-total]");
  const broadcast = demo.getByRole("checkbox", { name: "Broadcast" });
  const alice = demo.getByRole("button", { name: "Record 7 birds for Alice" });
  await expect(alice).toBeEnabled();
  await expect(demo.getByRole("button", { name: "Record 3 birds for Bob" })).toBeDisabled();
  await broadcast.uncheck();
  await alice.click();
  await expect(totals).toHaveText(["7", "0", "0"]);
  await expect(demo.locator("[data-room-status]")).toContainText("waiting for storage confirmation");
  expect(sent).toEqual([{ type: "state", epoch, count: 7 }]);

  if (!connection) throw new Error("The room did not connect.");
  const send = (counts: { A: number; B: number; C: number }, generation = epoch) =>
    connection!.send(JSON.stringify({ type: "state", state: { epoch: generation, counts } }));
  send({ A: 7, B: 0, C: 0 });
  send({ A: 7, B: 0, C: 0 });
  send({ A: 4, B: 0, C: 0 });
  await expect(demo.locator("[data-room-status]")).not.toContainText("waiting for storage confirmation");
  send({ A: 7, B: 3, C: 1 });
  await expect(totals).toHaveText(["7", "3", "1"]);
  await expect(demo.locator('[role="status"]')).toContainText("3 checkpoint notes");
  await broadcast.check();
  await expect(totals).toHaveText(["11", "11", "11"]);

  connection.send(JSON.stringify({
    type: "reset", state: { epoch: nextEpoch, counts: { A: 0, B: 0, C: 0 } },
  }));
  await expect(totals).toHaveText(["0", "0", "0"]);
  send({ A: 100, B: 3, C: 1 });
  await expect(totals).toHaveText(["0", "0", "0"]);
  await broadcast.uncheck();
  await demo.getByRole("button", { name: "Record 1 bird for Alice" }).click();
  await expect(totals).toHaveText(["1", "0", "0"]);
  expect(sent.at(-1)).toEqual({ type: "state", epoch: nextEpoch, count: 1 });
  connection.send(JSON.stringify({
    type: "error", message: "The room rejected this state.",
    state: { epoch: nextEpoch, counts: { A: 0, B: 0, C: 0 } },
  }));
  await expect(totals).toHaveText(["0", "0", "0"]);
  await expect(demo.locator("[data-room-status]")).toHaveText("The room rejected this state.");
  connection.close({ code: 1000, reason: "connection lost" });
  await expect(alice).toBeDisabled();
  await expect(demo.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await expect(demo.locator("[data-room-status]")).toContainText("unconfirmed changes");
  await demo.getByRole("button", { name: "Leave room" }).click();
  await expect(alice).toBeEnabled();
});

test("an observer restores a snapshot and cannot reset the room", async ({ page }) => {
  await page.routeWebSocket(/\/rooms\/EAGLE7$/, (socket) => {
    socket.send(JSON.stringify({
      type: "hello", room: "EAGLE7", replica: null, connected: 4,
      state: { epoch, counts: { A: 7, B: 3, C: 1 } },
    }));
  });
  await page.goto("/structures/g-counter/?room=EAGLE7");
  const demo = page.getByTestId("g-counter-demo");
  await expect(demo.locator("[data-total]")).toHaveText(["11", "11", "11"]);
  await expect(demo.getByRole("button", { name: "Record 1 bird for Alice" })).toBeDisabled();
  await expect(demo.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
  await expect(demo.getByLabel("Notes left at checkpoint")).toHaveText("0 notes");
});
