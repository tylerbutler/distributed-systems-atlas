import { expect, test } from "@playwright/test";
import type { Result } from "@atlas/toolkit";

test("toolkit kernels run in a browser without clocks, randomness, network, or timers", async ({ page }) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const url = "/toolkit/index.ts";
    const toolkit: typeof import("@atlas/toolkit") = await import(url);
    const { createMvRegister, createOrSet, write, add, remove, merge, inspect } = toolkit;
    const unwrap = <T>(result: Result<T>): T => {
      if (!result.ok) throw new Error(`${result.error.tag}: ${result.error.message}`);
      return result.value;
    };
    const original = {
      now: Date.now, random: Math.random, fetch: window.fetch,
      timeout: window.setTimeout, interval: window.setInterval,
    };
    const forbidden = (): never => { throw new Error("kernel used an impure browser API"); };
    Date.now = Math.random = forbidden;
    Object.assign(window, { fetch: forbidden, setTimeout: forbidden, setInterval: forbidden });
    try {
      const red = unwrap(write(unwrap(createMvRegister("A")), "red"));
      const blue = unwrap(write(unwrap(createMvRegister("B")), "blue"));
      const siblings = unwrap(merge(red.state, blue.operation));
      const green = unwrap(write(siblings, "green"));
      const first = unwrap(add(unwrap(createOrSet("A")), "beacon"));
      const peer = unwrap(merge(unwrap(createOrSet("B")), first.operation));
      const removal = unwrap(remove(first.state, "beacon"));
      const concurrent = unwrap(add(peer, "beacon"));
      const set = unwrap(merge(unwrap(merge(concurrent.state, removal.operation)), first.operation));
      return {
        siblings: unwrap(inspect(siblings)).values,
        resolved: unwrap(inspect(unwrap(merge(blue.state, green.operation)))).values,
        set: unwrap(inspect(set)).values,
        nodeGlobals: "process" in globalThis || "Buffer" in globalThis,
      };
    } finally {
      Date.now = original.now;
      Math.random = original.random;
      window.fetch = original.fetch;
      window.setTimeout = original.timeout;
      window.setInterval = original.interval;
    }
  });
  expect(result).toEqual({
    siblings: ["blue", "red"], resolved: ["green"], set: ["beacon"], nodeGlobals: false,
  });
});
