import { expect, test, type WebSocketRoute } from "@playwright/test";

const epoch = "9df10f6c-c764-46d8-a3c8-54eec6227005";

for (const counter of ["g-counter", "shared-counter"]) {
  test(`${counter} keeps essential recovery limits and links to shared documentation without JavaScript`, async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`/labs/${counter}/`);
      const storage = page.getByRole("region", { name: "Storage and recovery", exact: true });
      await expect(storage).toBeVisible();
      if (counter === "g-counter") {
        await expect(storage).toContainText("one stored row");
        await expect(storage).toContainText("Reset clears them to zero");
      } else {
        await expect(storage).toContainText("numbered signed operations");
        await expect(storage).toContainText("Reset clears it and restores 10");
        await expect(storage).toContainText("At 1,000 operations");
      }
      await expect(storage.getByLabel("Durable Object definition", { exact: true })).toBeVisible();
      await expect(storage).toContainText("Closing all tabs does not clear stored data");
      await expect(storage).toContainText("no persistent offline outbox or automatic reconnect");
      await expect(storage).toContainText("Anyone with the room code can join");
      await expect(page.getByRole("region", { name: "Try a concurrent update" }))
        .toContainText("Reset clears the shared room for all connected hikers");
      await expect(storage.getByRole("link", { name: "How multiplayer rooms work", exact: true }))
        .toHaveAttribute("href", "/atlas/multiplayer-rooms/");
      await expect(storage.locator("table")).toHaveCount(0);
      await expect(page.locator(".lab-notes")).toHaveCount(0);
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
    const rail = page.getByRole("navigation", { name: "Page position", exact: true });
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
