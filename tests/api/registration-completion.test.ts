import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// Same slug convention as registrations-self.test.ts / registrations-
// membership.test.ts — the e2e seed catalog exports no fixture ids, so tests
// resolve the season id themselves at runtime.
const ADULT_OPEN_SEASON_SLUG = "e2e-adult-open-soccer-2026";

// CI doesn't carry STRIPE_SECRET_KEY by default; guest-checkout 503s on the
// Stripe-session step without it. Mirror the gate used across the other
// guest-checkout suites so the Stripe-dependent case skips cleanly in CI but
// runs locally where Stripe is configured.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;

let adultSeasonId: string;

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
});

describe("guest-checkout v2 (deferred waiver/DOB)", () => {
  itWithStripe(
    "accepts a registrant without birthDate or waiver and returns a clientSecret carrying registrationId",
    async () => {
      const email = `w1-${Date.now()}-${Math.random().toString(36).slice(2)}@test.aspiresports.com`;
      const res = await apiFetch("/api/registrations/guest-checkout", {
        method: "POST",
        body: JSON.stringify({
          seasonId: adultSeasonId,
          registrant: {
            firstName: "Wave",
            lastName: "One",
            email,
            isSelf: true,
          },
          registrationType: "full",
          waiverSigned: false,
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      // Endpoint returns embedded-checkout PaymentIntent shape; also handles
      // free-after-discount (paid=true) and waitlist (waitlisted=true) paths.
      expect(body.clientSecret ?? body.paid ?? body.waitlisted).toBeTruthy();
      // Task 6 addendum: registrationId must be present in every response
      // branch so the Task 8 confirm screen can key off it regardless of
      // which path the registration took.
      expect(body.registrationId).toBeTruthy();
    },
  );

  it("still rejects waiverSigned:true without a signature", async () => {
    const email = `w2-${Date.now()}-${Math.random().toString(36).slice(2)}@test.aspiresports.com`;
    const res = await apiFetch("/api/registrations/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        seasonId: adultSeasonId,
        registrant: { firstName: "A", lastName: "B", email, isSelf: true },
        registrationType: "full",
        waiverSigned: true,
      }),
    });
    expect(res.status).toBe(400);
  });
});

// Task 7: POST /api/registrations/{id}/complete — post-payment completion.
// Per the Execution Addendum (Task 7 adjustments), the fixture is minted
// in-test rather than seeded: a v2 guest-checkout call with a unique email
// creates a brand-new user, whose response carries both the session
// Set-Cookie (new users only — see guest-checkout.ts's
// "account-takeover prevention" comment) and registrationId (Task 6
// addendum). Payment status is irrelevant to signing, so the Stripe-gated
// itWithStripe split from the suite above doesn't apply here.
describe("registration completion (POST /api/registrations/{id}/complete)", () => {
  async function mintGuestRegistration(): Promise<{
    registrationId: string;
    cookie: string;
  }> {
    const email = `complete-${Date.now()}-${Math.random().toString(36).slice(2)}@test.aspiresports.com`;
    const res = await apiFetch("/api/registrations/guest-checkout", {
      method: "POST",
      body: JSON.stringify({
        seasonId: adultSeasonId,
        registrant: {
          firstName: "Complete",
          lastName: "Flow",
          email,
          isSelf: true,
        },
        registrationType: "full",
        waiverSigned: false,
      }),
    });
    expect(res.status).toBe(200);
    const cookie = res.headers.get("set-cookie");
    if (!cookie) {
      throw new Error(
        "guest-checkout did not return a session cookie for a new user",
      );
    }
    const body = await res.json();
    expect(body.registrationId).toBeTruthy();
    return { registrationId: body.registrationId, cookie };
  }

  it("rejects an unauthenticated request with 401", async () => {
    const { registrationId } = await mintGuestRegistration();
    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Complete Flow",
      }),
    });
    expect(res.status).toBe(401);
  });

  it("signs the waiver on the happy path, then is idempotent on a repeat call", async () => {
    const { registrationId, cookie } = await mintGuestRegistration();

    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Complete Flow",
        birthDate: "1990-05-15",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signed).toBe(true);
    expect(body.ageReviewNeeded).toBe(false);

    const repeat = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Complete Flow",
      }),
    });
    expect(repeat.status).toBe(200);
    const repeatBody = await repeat.json();
    expect(repeatBody.alreadySigned).toBe(true);
  });

  it("flags age review for a DOB outside the season's age group without blocking the sign", async () => {
    const { registrationId, cookie } = await mintGuestRegistration();

    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Complete Flow",
        // Adult 18+ season (minAge 18) — this DOB is well under that.
        birthDate: "2015-01-01",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signed).toBe(true);
    expect(body.ageReviewNeeded).toBe(true);
  });
});
