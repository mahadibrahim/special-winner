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
    // Burn through 10 requests so the bucket is at the limit, then expect the 11th
    // to fail-open with exists:false and the x-ratelimit-exceeded header set.
    const email = `unique-${Date.now()}@example.com`;
    for (let i = 0; i < 10; i++) {
      await fetch(`${BASE}/api/auth/check-email?email=${email}`);
    }
    const res = await fetch(`${BASE}/api/auth/check-email?email=${email}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ exists: false });
    expect(res.headers.get("x-ratelimit-exceeded")).toBe("1");
  });
});
