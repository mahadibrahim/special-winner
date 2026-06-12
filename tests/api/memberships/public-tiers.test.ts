import { describe, expect, it } from "vitest";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Post-single-org cutover (PR #168), the Aspire org may have membership_tiers
// rows (test runs accumulate tier fixtures). The original "empty array" assertion
// was valid when Aspire had no tiers, but is now stale. Assert 200 + valid shape
// instead so the test remains meaningful as an endpoint contract check.
describe("GET /api/public/membership-tiers", () => {
  it("returns 200 with a tiers array", async () => {
    const res = await fetch(`${BASE}/api/public/membership-tiers`, {
      headers: { host: "aspire.local" },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tiers)).toBe(true);
    // Each tier (if any) must have the documented shape.
    for (const tier of body.tiers) {
      expect(typeof tier.id).toBe("string");
      expect(typeof tier.name).toBe("string");
    }
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
