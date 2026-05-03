import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch, getAdminCookie } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Was imported from src/lib/db/seeds/seed-e2e-tests.ts; that seed catalog was
// removed pre-launch (2026-05-02). Slug retained for when a dedicated test DB
// is stood up later.
const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

// CI doesn't carry STRIPE_SECRET_KEY by default; the guest-checkout endpoint
// then 503s on the Stripe-session step. Mirror the gate from
// registrations-guest-checkout.test.ts so the Stripe-dependent case skips
// cleanly in CI but runs locally where Stripe is configured.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

let adultSeasonId: string;
let adultCookie: string;

beforeAll(async () => {
  const db = getDb();
  const [season] = await db
    .select({ id: seasons.id })
    .from(seasons)
    .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
    .limit(1);

  if (!season) {
    throw new Error(
      `Adult open soccer season not found (slug: ${ADULT_OPEN_SEASON_SLUG}) — re-run npm run db:seed:e2e`,
    );
  }
  adultSeasonId = season.id;

  // Cache the cookie once to avoid rate-limiting (each getAuthCookie call
  // counts as a sign-in attempt against the in-memory rate limiter).
  adultCookie = await getAuthCookie(
    "adult-self@test.aspiresports.com",
    "TestParent123!",
  );
});

describe("POST /api/registrations/guest-checkout — adult self path", () => {
  itWithStripe("creates user + self person + registration when registrant is an adult", async () => {
    const email = `adult-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

    const res = await apiFetch("/api/registrations/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        seasonId: adultSeasonId,
        registrant: {
          firstName: "Sam",
          lastName: "Adult",
          email,
          phone: "+15555550100",
          birthDate: "1985-06-15",
          isSelf: true,
        },
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Sam Adult",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.checkoutUrl ?? body.paid ?? body.waitlisted).toBeTruthy();
  });
});

describe("POST /api/registrations — self registration", () => {
  it("registers an adult user for an adult-eligible season without a family member id", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: adultSeasonId,
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });

    // 201 on first registration, 200 on resume — both are success
    expect([200, 201]).toContain(res.status);
    const body = await res.json();
    expect(body.registration).toBeTruthy();
    expect(body.registration.familyMemberId).toBeTruthy();
  });

  it("rejects body that supplies both familyMemberId and registerSelf", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        familyMemberId: "00000000-0000-0000-0000-000000000000",
        registerSelf: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "X",
      }),
    });

    expect(res.status).toBe(400);
  });

  it("rejects body that supplies neither familyMemberId nor registerSelf", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: "00000000-0000-0000-0000-000000000000",
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "X",
      }),
    });

    expect(res.status).toBe(400);
  });
});

describe("POST /api/registrations — lookingForTeam flag", () => {
  it("persists lookingForTeam flag for adult self registration", async () => {
    const res = await apiFetch("/api/registrations", {
      method: "POST",
      cookie: adultCookie,
      body: JSON.stringify({
        seasonId: adultSeasonId,
        registerSelf: true,
        lookingForTeam: true,
        registrationType: "full",
        waiverSigned: true,
        waiverSignedBy: "Adult Self",
      }),
    });

    // 201 Created or 200 if already exists for this user (resumed)
    expect(res.status).toBeLessThan(300);
    const body = await res.json();
    expect(body.registration).toBeTruthy();
    expect(body.registration.lookingForTeam).toBe(true);
  });
});

describe("POST /api/admin/walk-up-registration — adult mode", () => {
  it("admin walk-up creates an adult self registration", async () => {
    const adminCookie = await getAdminCookie();
    const email = `walkup-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;

    const res = await apiFetch("/api/admin/walk-up-registration", {
      method: "POST",
      cookie: adminCookie,
      body: JSON.stringify({
        seasonId: adultSeasonId,
        adultMode: true,
        registrant: {
          firstName: "Walkup",
          lastName: "Adult",
          email,
          phone: "+15555550101",
          birthDate: "1990-03-03",
        },
        registrationType: "full",
        paymentStatus: "paid",
        amountPaidCents: 0,
        waiverSigned: true,
        waiverSignedBy: "Walkup Adult",
      }),
    });

    expect(res.status).toBeLessThan(300);
    const body = await res.json();
    expect(body.registrationId).toBeTruthy();
    expect(body.familyMemberId).toBeTruthy();
  });
});
