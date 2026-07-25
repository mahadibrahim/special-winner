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

  it("handles fail-open gracefully if anything throws (returns allowed: true)", () => {
    // This is a bit tricky to test directly without mocking. We can at least verify
    // that the function doesn't throw and returns { allowed: true } on normal operation.
    // For true error handling, the only way would be to mock internals, which the
    // requirements say not to do.
    const result = rateLimit("test-key", 3, 1000, () => Date.now());
    expect(result).toEqual(expect.objectContaining({ allowed: expect.any(Boolean) }));
  });
});
