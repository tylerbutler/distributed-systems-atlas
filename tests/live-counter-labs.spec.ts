import { expect, test, type WebSocketRoute } from "@playwright/test";

const epoch = "9df10f6c-c764-46d8-a3c8-54eec6227005";

for (const counter of ["g-counter", "shared-counter"]) {
  test(`${counter} documents persisted fields and data lifetimes without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`/labs/${counter}/`);
      const storage = page.getByRole("region", { name: "What the Durable Object stores", exact: true });
      await expect(storage).toBeVisible();
      await expect(storage).toContainText("not a live view of your room");
      const sample = JSON.parse(await storage.locator(".storage-example code").innerText());
      if (counter === "g-counter") {
        await expect(storage.getByRole("table", { name: "counter table" }).locator("tbody th"))
          .toHaveText(["singleton", "epoch", "a", "b", "c"]);
        expect(sample).toEqual({ counter: { singleton: 1, epoch, a: 7, b: 3, c: 0 } });
        await expect(storage).toContainText("7 + 3 + 0 = 10");
        await expect(storage).toContainText("sets a, b, and c to zero");
      } else {
        await expect(storage.getByRole("table", { name: "room table" }).locator("tbody th"))
          .toHaveText(["singleton", "epoch"]);
        await expect(storage.getByRole("table", { name: "operations table" }).locator("tbody th"))
          .toHaveText(["sequenceNumber", "id", "author", "amount"]);
        expect(sample).toEqual({
          room: { singleton: 1, epoch },
          operations: [
            { sequenceNumber: 1, id: "11111111-1111-4111-8111-111111111111", author: "A", amount: 3 },
            { sequenceNumber: 2, id: "22222222-2222-4222-8222-222222222222", author: "B", amount: -1 },
          ],
        });
        await expect(storage).toContainText("10 + 3 - 1 = 12");
        await expect(storage).toContainText("At 1,000 operations, the server refuses new changes");
        await expect(storage).toContainText("Reset deletes all operation rows");
      }
      for (const term of ["Durable Object", "epoch", "hibernation"]) {
        await expect(storage.getByLabel(`${term} definition`, { exact: true })).toBeVisible();
      }
      await expect(storage).toContainText("Closing all tabs leaves the SQLite data intact");
      await expect(storage).toContainText("attachments are not SQLite rows");
      await expect(storage).toContainText("Hiker roles identify connections, not user accounts");
      for (const width of [320, 390, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
      }
    } finally {
      await context.close();
    }
  });

  test(`${counter} lab creates a room and keeps setup separate from the local model`, async ({ page, context }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    let connection: WebSocketRoute | undefined;
    await page.routeWebSocket(
      counter === "g-counter" ? /\/rooms\/[A-Z0-9]{6}$/ : /\/rooms\/shared-counter\/[A-Z0-9]{6}$/,
      (socket) => {
        connection = socket;
        socket.send(JSON.stringify({
          type: "hello", room: socket.url().split("/").at(-1), replica: "A",
          connected: 1, replicas: ["A"],
          ...(counter === "g-counter"
            ? { state: { epoch, counts: { A: 0, B: 0, C: 0 } } }
            : { epoch, operations: [] }),
        }));
      },
    );
    await page.goto(`/labs/${counter}/`);
    const rail = page.getByRole("navigation", { name: "Sheet position", exact: true });
    await expect(rail.getByRole("link", { name: "Counters", exact: true })).toHaveAttribute("href", "/structures/counters/");
    await expect(rail.locator('[aria-current="page"]')).toContainText("live lab");
    const demo = page.getByTestId(`${counter}-demo`);
    const input = demo.getByRole("textbox", { name: "Room code" });
    await expect(input).toBeEnabled();
    await expect(demo.getByRole("button", { name: "Join room" })).toBeDisabled();
    await expect(demo.locator("[data-increment], [data-update]")).toHaveCount(counter === "g-counter" ? 9 : 12);
    for (const edit of await demo.locator("[data-increment], [data-update]").all()) {
      await expect(edit).toBeDisabled();
    }
    await expect(demo.getByRole("button", { name: "Reset", exact: true })).toBeDisabled();
    await expect(demo.locator(".live-delivery-controls")).not.toHaveAttribute("open", "");
    await expect(demo.getByRole("button", { name: "Create room" })).toBeVisible();
    await expect(demo.locator("[data-room-link]")).toBeHidden();
    await demo.getByRole("button", { name: "Create room" }).click();
    await expect(page).toHaveURL(new RegExp(`/labs/${counter}/\\?room=[A-Z0-9]{6}$`));
    await expect(demo).toHaveAttribute("data-room-role", "A");
    await expect(demo.locator('[data-room-presence="A"]')).toHaveText("You are connected");
    await expect(demo.locator('[data-room-presence="B"]')).toHaveText("Available");
    await expect(demo.locator("[data-room-link]")).toHaveAttribute("href", page.url());
    await expect(demo.locator("[data-room-link]")).toHaveAttribute("target", "_blank");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await demo.getByRole("button", { name: "Copy room link" }).click();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(page.url());
    if (!connection) throw new Error("The lab did not connect.");
    connection.send(JSON.stringify({ type: "presence", connected: 2, replicas: ["A", "C"] }));
    await expect(demo.locator('[data-room-presence="C"]')).toHaveText("Connected");
    await expect(demo.locator('[data-room-presence="B"]')).toHaveText("Available");
    connection.send(JSON.stringify({ type: "presence", connected: 1, replicas: ["A"] }));
    await expect(demo.locator('[data-room-presence="C"]')).toHaveText("Available");
    await demo.getByRole("button", { name: "Leave room" }).click();
    await expect(page).toHaveURL(`/labs/${counter}/`);
    await expect(demo.locator("[data-room-link]")).toBeHidden();
    await expect(demo).toHaveAttribute("data-room-role", "unassigned");
    expect(errors).toEqual([]);
  });

  for (const replica of ["A", "B", "C"]) {
    test(`${counter} highlights ${replica}'s notebook on desktop and mobile`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.routeWebSocket(/\/rooms\/(?:shared-counter\/)?EAGLE7$/, (socket) => {
        socket.send(JSON.stringify({
          type: "hello", room: "EAGLE7", replica, connected: 3, replicas: ["A", "B", "C"],
          ...(counter === "g-counter"
            ? { state: { epoch, counts: { A: 0, B: 0, C: 0 } } }
            : { epoch, operations: [] }),
        }));
      });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto(`/labs/${counter}/?room=EAGLE7`);
      const demo = page.getByTestId(`${counter}-demo`);
      const own = demo.locator(`[data-client="${replica}"]`);
      await expect(own).toHaveAttribute("data-your-replica", "true");
      await expect(own.locator("[data-replica-ownership]")).toHaveText("Your notebook");
      await expect(demo.locator('[data-your-replica="false"] [data-replica-ownership]'))
        .toHaveText(["Local copy in this browser", "Local copy in this browser"]);
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 1000 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(0);
        const ownBox = (await own.boundingBox())!;
        const channel = (await demo.locator(".sequencer-channel").boundingBox())!;
        const otherBoxes = await demo.locator('[data-your-replica="false"]').evaluateAll((elements) =>
          elements.map((element) => {
            const box = element.getBoundingClientRect();
            return { x: box.x, y: box.y };
          }),
        );
        if (width < 1024) {
          expect(channel.y).toBeGreaterThan(ownBox.y);
          expect(otherBoxes.every(({ y }) => y > channel.y)).toBe(true);
        } else {
          expect(channel.x).toBeGreaterThan(ownBox.x);
          expect(otherBoxes.every(({ x }) => x > channel.x)).toBe(true);
        }
        for (const button of await demo.locator("button:visible").all()) {
          expect((await button.boundingBox())!.height).toBeGreaterThanOrEqual(44);
        }
      }
      expect(errors).toEqual([]);
    });
  }
}
