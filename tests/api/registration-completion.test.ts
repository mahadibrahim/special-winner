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
