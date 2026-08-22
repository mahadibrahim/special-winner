import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { rateLimit, _resetRateLimitForTests } from "@/lib/auth/rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    _resetRateLimitForTests();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  afterEach(() => {
    _resetRateLimitForTests();
    delete process.env.DISABLE_RATE_LIMIT;
  });

  it("allows up to max hits within the window", () => {
    const now = () => 1000;
    const result1 = rateLimit("test-key", 3, 1000, now);
    const result2 = rateLimit("test-key", 3, 1000, now);
    const result3 = rateLimit("test-key", 3, 1000, now);

    expect(result1.allowed).toBe(true);
    expect(result2.allowed).toBe(true);
    expect(result3.allowed).toBe(true);
  });

  it("blocks the (max+1)th hit and returns retryAfter", () => {
    const now = () => 1000;
    rateLimit("test-key", 3, 1000, now); // 1st
    rateLimit("test-key", 3, 1000, now); // 2nd
    rateLimit("test-key", 3, 1000, now); // 3rd (max)

    const result = rateLimit("test-key", 3, 1000, now);
    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
    expect(typeof result.retryAfter).toBe("number");
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it("allows requests again after the window expires", () => {
    const times = [1000, 1000, 1000, 2500];
    let timeIndex = 0;
    const now = () => times[timeIndex] || 2500;

    // Hit 3 times at t=1000 (fills the bucket)
    rateLimit("test-key", 3, 1000, now);
    rateLimit("test-key", 3, 1000, now);
    rateLimit("test-key", 3, 1000, now);

    // Next hit at t=1000 should be blocked (still in window)
    let result = rateLimit("test-key", 3, 1000, now);
    expect(result.allowed).toBe(false);

    // At t=2500, the window expires (2500 - 1000 = 1500 > 1000ms).
    // The oldest hits (at t=1000) should be purged. We should now have 0 hits.
    timeIndex = 3;
    result = rateLimit("test-key", 3, 1000, now);
    expect(result.allowed).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const now = () => 1000;

    // Fill key-a to max
    rateLimit("key-a", 2, 1000, now);
    rateLimit("key-a", 2, 1000, now);

    // key-a is now at max; next request should be blocked
    let resultA = rateLimit("key-a", 2, 1000, now);
    expect(resultA.allowed).toBe(false);

    // But key-b has no hits yet, so it should be allowed
    const resultB = rateLimit("key-b", 2, 1000, now);
    expect(resultB.allowed).toBe(true);
  });

  it("respects the DISABLE_RATE_LIMIT env flag and always allows", () => {
    process.env.DISABLE_RATE_LIMIT = "1";
    const now = () => 1000;

    // Hit 10 times (way over a limit of 2)
    const results = Array.from({ length: 10 }, () =>
      rateLimit("test-key", 2, 1000, now),
    );

    // All should be allowed because the flag is set
    results.forEach((result) => {
      expect(result.allowed).toBe(true);
    });
  });

  it("calculates retryAfter as the time until the oldest hit ages out", () => {
    const now = () => 1000;

    // Record 3 hits at t=1000
    rateLimit("test-key", 3, 1000, now);
    rateLimit("test-key", 3, 1000, now);
    rateLimit("test-key", 3, 1000, now);

    // At t=1500 (500ms later), the oldest hit will age out at t=2000.
    // So retryAfter should be about 500 seconds (from 1500 to 2000 converted to seconds).
    const customNow = () => 1500;
    const result = rateLimit("test-key", 3, 1000, customNow);

    expect(result.allowed).toBe(false);
    expect(result.retryAfter).toBeDefined();
    // The oldest hit was at t=1000, window is 1000ms, so it ages out at t=2000.
    // At t=1500, we need to wait 2000 - 1500 = 500ms, which is 1 second when ceiled.
    expect(result.retryAfter).toBe(1);
  });

  it("fails OPEN when the limiter itself throws — a limiter bug must never block auth (#462)", () => {
    // The injectable clock is the natural fault seam: everything inside the
    // try block runs after `now()` is called, so a throwing clock exercises
    // the real catch branch — no mocking of internals needed.
    const throwingNow = () => {
      throw new Error("clock exploded");
    };
    const result = rateLimit("fail-open-key", 3, 1000, throwingNow);
    expect(result).toEqual({ allowed: true });
  });

  it("fail-open does not poison the bucket — the limiter still works afterwards", () => {
    const key = `fail-open-recovery-${Date.now()}`;
    const boom = () => {
      throw new Error("boom");
    };
    rateLimit(key, 2, 1000, boom); // fail-open pass-through, records nothing
    const now = () => 1000;
    expect(rateLimit(key, 2, 1000, now).allowed).toBe(true);
    expect(rateLimit(key, 2, 1000, now).allowed).toBe(true);
    expect(rateLimit(key, 2, 1000, now).allowed).toBe(false); // cap still enforced
  });
});
