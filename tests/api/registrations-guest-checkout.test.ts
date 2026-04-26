import { describe, it, expect } from "vitest";

const BASE = process.env.TEST_BASE_URL || "http://localhost:4321";

// CI doesn't carry STRIPE_SECRET_KEY by default; the endpoint then 503s on the
// Stripe-session step. The negative-path tests (400/404) still work without
// Stripe and stay enabled. The happy-path tests are gated below.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

async function fetchOpenSeasonId(): Promise<string> {
  const res = await fetch(`${BASE}/api/public/seasons?status=open`);
  if (!res.ok) throw new Error(`Failed to fetch seasons: ${res.status}`);
  const data = await res.json();
  const seasons = data.seasons ?? [];
  if (seasons.length === 0) {
    throw new Error("No open seasons in test DB — re-seed e2e data");
  }
  // Return the first season that has capacity (so we get a stripe_session, not waitlist).
  for (const s of seasons) {
    if (!s.maxParticipants || (s.registeredCount ?? 0) < s.maxParticipants) {
      return s.id;
    }
  }
  return seasons[0].id;
}

const validBody = (overrides: Record<string, unknown> = {}) => ({
  parent: {
    firstName: "Guest",
    lastName: "Tester",
    email: `guest-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
    phone: "+15555550100",
  },
  child: {
    firstName: `Kid${Date.now()}`,
    lastName: "Tester",
    birthDate: "2018-06-01",
    gender: "male",
  },
  registrationType: "full" as const,
  waiverSigned: true,
  waiverSignedBy: "Guest Tester",
  ...overrides,
});

describe("POST /api/registrations/guest-checkout", () => {
  itWithStripe("creates user, family member, registration, and returns checkoutUrl for new email", async () => {
    const seasonId = await fetchOpenSeasonId();
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...validBody(), seasonId }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveProperty("checkoutUrl");
    expect(typeof body.checkoutUrl).toBe("string");
    expect(body.wasNewUser).toBe(true);
    const setCookie = res.headers.get("set-cookie") || "";
    // Lucia cookie set for new users
    expect(setCookie).toMatch(/auth_session=/);
  });

  itWithStripe("matches existing email without setting a session cookie", async () => {
    const seasonId = await fetchOpenSeasonId();
    const body = validBody({
      parent: {
        firstName: "Parent",
        lastName: "Test",
        email: "parent@test.aspiresports.com",
      },
      // Use a unique child to avoid duplicate-registration guard
      child: {
        firstName: `Existing${Date.now()}`,
        lastName: "Test",
        birthDate: "2017-03-15",
        gender: "female",
      },
    });
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, seasonId }),
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.wasNewUser).toBe(false);
    expect(data).toHaveProperty("checkoutUrl");
    const setCookie = res.headers.get("set-cookie") || "";
    expect(setCookie).not.toMatch(/auth_session=/);
  });

  it("returns 400 for malformed payload (missing parent.email)", async () => {
    const seasonId = await fetchOpenSeasonId();
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody({ parent: { firstName: "X", lastName: "Y" } }),
        seasonId,
      }),
    });
    expect(res.status).toBe(400);
  });

  it("returns 404 for invalid seasonId", async () => {
    const res = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...validBody(),
        seasonId: "00000000-0000-0000-0000-000000000000",
      }),
    });
    expect(res.status).toBe(404);
  });

  itWithStripe("dedupes child + resumes registration when called twice with same email/child/season", async () => {
    const seasonId = await fetchOpenSeasonId();
    const email = `guest-dedupe-${Date.now()}@example.com`;
    const child = {
      firstName: `DedupeKid${Date.now()}`,
      lastName: "Child",
      birthDate: "2019-01-01",
      gender: "other",
    };
    const body = validBody({
      parent: { firstName: "Dedupe", lastName: "Parent", email },
      child,
    });
    // First call: creates everything
    const r1 = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, seasonId }),
    });
    expect(r1.status).toBe(200);
    // Second call: same email + child + season, should resume (not 400)
    const r2 = await fetch(`${BASE}/api/registrations/guest-checkout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, seasonId }),
    });
    expect(r2.status).toBe(200);
    const data = await r2.json();
    expect(data).toHaveProperty("checkoutUrl");
  });
});
