import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { verifyTurnstile } from "@/lib/auth/turnstile";

describe("verifyTurnstile", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });
  afterEach(() => vi.unstubAllGlobals());

  it("fails closed when secret is unset in production", async () => {
    const ok = await verifyTurnstile("any-token", { secret: undefined, isProd: true });
    expect(ok).toBe(false);
  });

  it("fails open when secret is unset in dev", async () => {
    const ok = await verifyTurnstile("any-token", { secret: undefined, isProd: false });
    expect(ok).toBe(true);
  });

  it("returns true when Cloudflare reports success=true", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);
    const ok = await verifyTurnstile("token-x", { secret: "k", isProd: true });
    expect(ok).toBe(true);
  });

  it("returns false when Cloudflare reports success=false", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ success: false, "error-codes": ["timeout-or-duplicate"] }),
    } as Response);
    const ok = await verifyTurnstile("token-x", { secret: "k", isProd: true });
    expect(ok).toBe(false);
  });

  it("returns false on network error", async () => {
    fetchSpy.mockRejectedValue(new Error("boom"));
    const ok = await verifyTurnstile("token-x", { secret: "k", isProd: true });
    expect(ok).toBe(false);
  });

  it("returns false when Cloudflare returns non-2xx", async () => {
    fetchSpy.mockResolvedValue({ ok: false } as Response);
    const ok = await verifyTurnstile("token-x", { secret: "k", isProd: true });
    expect(ok).toBe(false);
  });

  it("rejects empty token even when secret is set", async () => {
    const ok = await verifyTurnstile("", { secret: "k", isProd: true });
    expect(ok).toBe(false);
  });
});
