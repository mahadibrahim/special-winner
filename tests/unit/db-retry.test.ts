import { describe, it, expect, vi } from "vitest";
import { isTransientDbError, withDbRetry } from "@/lib/db/retry";

describe("isTransientDbError", () => {
  it("flags connection-class errors", () => {
    expect(
      isTransientDbError(new Error("write CONNECT_TIMEOUT switchyard.proxy.rlwy.net:31999")),
    ).toBe(true);
    expect(isTransientDbError(new Error("connect ECONNREFUSED 10.0.0.1:5432"))).toBe(true);
    expect(isTransientDbError(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(
      isTransientDbError(new Error("timeout exceeded when trying to connect")),
    ).toBe(true);
  });

  it("does NOT flag application/SQL errors", () => {
    expect(isTransientDbError(new Error('column "foo" does not exist'))).toBe(false);
    expect(isTransientDbError(new Error("duplicate key value violates unique constraint"))).toBe(false);
    expect(isTransientDbError(new Error("something else"))).toBe(false);
    expect(isTransientDbError("a plain string")).toBe(false);
  });
});

describe("withDbRetry", () => {
  it("returns immediately on success (single call)", async () => {
    const fn = vi.fn().mockResolvedValue("ok");
    await expect(withDbRetry(fn, { baseDelayMs: 0 })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries a transient failure then succeeds", async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error("write CONNECT_TIMEOUT host:5432"))
      .mockResolvedValueOnce("recovered");
    await expect(withDbRetry(fn, { attempts: 3, baseDelayMs: 0 })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("does NOT retry a non-transient error (fails fast, one call)", async () => {
    const fn = vi.fn().mockRejectedValue(new Error('relation "x" does not exist'));
    await expect(withDbRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow(/does not exist/);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("gives up after `attempts` transient failures and rethrows", async () => {
    const fn = vi.fn().mockRejectedValue(new Error("CONNECT_TIMEOUT"));
    await expect(withDbRetry(fn, { attempts: 3, baseDelayMs: 0 })).rejects.toThrow(/CONNECT_TIMEOUT/);
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
