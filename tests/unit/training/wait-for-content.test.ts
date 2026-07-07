import { describe, it, expect } from "vitest";
import { waitForContentReady } from "../../../training/lib/wait-for-content";

function fakePage(opts: { waitForFunctionThrows?: boolean } = {}) {
  const calls: { waits: number[]; waitForFunctionCalls: number } = {
    waits: [],
    waitForFunctionCalls: 0,
  };
  const page = {
    calls,
    async waitForTimeout(ms: number) {
      calls.waits.push(ms);
    },
    async waitForFunction(_fn: unknown, _arg: unknown, options: { timeout: number }) {
      calls.waitForFunctionCalls++;
      if (opts.waitForFunctionThrows) {
        throw new Error(`Timeout ${options.timeout}ms exceeded`);
      }
    },
  };
  return page;
}

describe("waitForContentReady", () => {
  it("pauses briefly, then polls for spinners to clear", async () => {
    const page = fakePage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await waitForContentReady(page as any);
    expect(page.calls.waits).toEqual([600]);
    expect(page.calls.waitForFunctionCalls).toBe(1);
  });

  it("respects a custom timeout", async () => {
    const page = fakePage();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await waitForContentReady(page as any, 5_000);
    expect(page.calls.waitForFunctionCalls).toBe(1);
  });

  it("resolves fail-soft even if a spinner never clears (does not throw)", async () => {
    const page = fakePage({ waitForFunctionThrows: true });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await expect(waitForContentReady(page as any)).resolves.toBeUndefined();
  });
});
