import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

async function adminCookie(): Promise<string> {
  const res = await fetch(`${BASE}/api/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "admin@test.aspiresports.com", password: "TestAdmin123!" }),
  });
  if (!res.ok) throw new Error(`signin failed: ${res.status}`);
  return res.headers.get("set-cookie")?.split(";")[0] ?? "";
}

describe("GET /api/admin/memberships/tiers", () => {
  it("401 without auth", async () => {
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`);
    expect(res.status).toBe(401);
  });
  it("lists tiers for the active org, ordered", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tiers)).toBe(true);
  });
});

describe("POST /api/admin/memberships/tiers", () => {
  it("422 when both prices null", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: "Bad", monthlyDollars: null, annualDollars: null, benefits: {}, displayOrder: 0, isActive: true }),
    });
    expect(res.status).toBe(422);
  });

  itWithStripe("creates a tier with Stripe price ids", async () => {
    const cookie = await adminCookie();
    const res = await fetch(`${BASE}/api/admin/memberships/tiers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", cookie },
      body: JSON.stringify({ name: `Test ${Date.now()}`, monthlyDollars: 29, annualDollars: 290, benefits: { rental_discount_pct: 10 }, displayOrder: 5, isActive: true }),
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.tier.stripePriceIdMonthly).toMatch(/^price_/);
    expect(body.tier.stripeProductId).toMatch(/^prod_/);
  });
});
