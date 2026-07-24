import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  isPrintfulConfigured,
  listStoreProducts,
  PrintfulNotConfiguredError,
} from "@/lib/printful/client";

describe("printful client config guard", () => {
  const original = process.env.PRINTFUL_API_KEY;
  beforeEach(() => {
    delete process.env.PRINTFUL_API_KEY;
  });
  afterEach(() => {
    if (original === undefined) delete process.env.PRINTFUL_API_KEY;
    else process.env.PRINTFUL_API_KEY = original;
  });

  it("reports not configured when the key is absent", () => {
    expect(isPrintfulConfigured()).toBe(false);
  });

  it("throws PrintfulNotConfiguredError before making any network call", async () => {
    await expect(listStoreProducts()).rejects.toBeInstanceOf(
      PrintfulNotConfiguredError,
    );
  });
});
