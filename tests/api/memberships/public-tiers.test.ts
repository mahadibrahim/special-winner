import { describe, expect, it } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Aspire has no membership_tiers rows today, so this assertion holds even
// before Task 17 seeds the SoccerOne tier. Leaving un-skipped — if the
// domain resolver picks SoccerOne instead of Aspire because Node's fetch
// stripped the `host` header on localhost, the failure is a real signal
// rather than something to mask with .skip.
describe("GET /api/public/membership-tiers", () => {
  it("returns empty array on the Aspire host", async () => {
    const res = await fetch(`${BASE}/api/public/membership-tiers`, {
      headers: { host: "aspire.local" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.tiers).toEqual([]);
  });
});

// SoccerOne assertions are skipped: they rely on a `host: soccerone…`
// header but Node's fetch strips Host (see src/pages/api/test/org-fixtures.ts
// comment). Verify via real browser / staging instead.
describe.skip("GET /api/public/membership-tiers (SoccerOne — host-stripping limit)", () => {
  it("returns SoccerOne tiers on the SoccerOne host", async () => {
    const res = await fetch(`${BASE}/api/public/membership-tiers`, {
      headers: { host: "soccerone.aspiresports.com" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tiers)).toBe(true);
    expect(body.tiers.length).toBeGreaterThan(0);
    expect(body.tiers[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
      benefits: expect.any(Object),
    });
  });

  it("does not leak inactive tiers", async () => {
    const res = await fetch(`${BASE}/api/public/membership-tiers`, {
      headers: { host: "soccerone.aspiresports.com" },
    });
    const body = await res.json();
    for (const tier of body.tiers) {
      expect(tier).not.toHaveProperty("isActive");
    }
  });
});
