import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

describe("GET /api/auth/check-email", () => {
  it("returns exists:false for an unknown email", async () => {
    const res = await fetch(
      `${BASE}/api/auth/check-email?email=nobody-${Date.now()}@example.com`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });

  it("returns exists:true for a known email", async () => {
    // The e2e seed creates parent@test.aspiresports.com — see src/lib/db/seeds/seed-e2e-tests.ts
    const res = await fetch(
      `${BASE}/api/auth/check-email?email=parent@test.aspiresports.com`,
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: true });
  });

  it("returns exists:false for malformed email (does not 400)", async () => {
    const res = await fetch(`${BASE}/api/auth/check-email?email=not-an-email`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
  });

  it("rate-limits after 10 requests in 60s from the same IP and fails open", async () => {
    // Test assumption: the dev server's in-memory bucket for this test runner's IP
    // is at < 10 entries when this test starts. If a previous test run within the
    // last 60s populated the bucket, the early-request assertion below catches it
    // with a clear error rather than letting this test pass for the wrong reason.
    const email = `unique-${Date.now()}@example.com`;
    const firstRes = await fetch(`${BASE}/api/auth/check-email?email=${email}`);
    expect(firstRes.headers.get("x-ratelimit-exceeded")).toBeNull();
    // Burn through 9 more (10 total), all of which should still be allowed.
    for (let i = 0; i < 9; i++) {
      await fetch(`${BASE}/api/auth/check-email?email=${email}`);
    }
    const res = await fetch(`${BASE}/api/auth/check-email?email=${email}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
    expect(res.headers.get("x-ratelimit-exceeded")).toBe("1");
  });
});
