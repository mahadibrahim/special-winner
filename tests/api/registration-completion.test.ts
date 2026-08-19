import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import { seasons, registrations, consents } from "@/lib/db/schema";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
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
//
// CI has no Stripe keys, so any fixture that routes through guest-checkout
// (which always mints a Stripe PaymentIntent, even on the deferred-waiver
// path) 503s on CI. Payment status is irrelevant to signing/age-review, so
// none of these four cases actually need Stripe — they're restructured to
// mint an OWNED, UNSIGNED registration via the authed
// POST /api/registrations path instead:
//   1. 401 test needs no fixture at all — auth is checked before any lookup.
//   2. 400 malformed-id test only needs an auth cookie.
//   3/4. happy-path + age-review both mint a fresh DEPENDENT (unique name
//      per run, via POST /api/family-members) then register that dependent
//      for the adult season via POST /api/registrations with
//      waiverSigned:false (this branch's own feature — no signature
//      required). create-registration.ts has no server-side age-eligibility
//      check at creation time (confirmed by reading it), so an
//      age-ineligible dependent registers for the 18+ season without being
//      rejected — which is exactly what the age-review case needs. The
//      dependent always carries a DOB (COPPA path, non-nullable), so
//      complete.ts's `effectiveDob = familyMember.birthDate ?? data.birthDate`
//      uses the STORED DOB and ignores whatever birthDate the completion
//      body sends.
// Net effect: all four cases are Stripe-free; no itWithStripe gating needed
// in this describe block.
describe("registration completion (POST /api/registrations/{id}/complete)", () => {
  async function mintOwnedRegistration(birthDate: string): Promise<{
    registrationId: string;
    familyMemberId: string;
    cookie: string;
  }> {
    const cookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!",
    );
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;

    const fmRes = await apiFetch("/api/family-members", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        firstName: "Complete",
        lastName: `Fixture${stamp}`,
        birthDate,
        parentalConsent: true,
      }),
    });
    expect(fmRes.status).toBe(201);
    const fmBody = await fmRes.json();
    const familyMemberId = fmBody.familyMember.id;
    expect(familyMemberId).toBeTruthy();

    const regRes = await apiFetch("/api/registrations", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        seasonId: adultSeasonId,
        familyMemberId,
        registrationType: "full",
        waiverSigned: false,
      }),
    });
    expect(regRes.status).toBe(201);
    const regBody = await regRes.json();
    expect(regBody.registration?.id).toBeTruthy();
    return { registrationId: regBody.registration.id, familyMemberId, cookie };
  }

  it("rejects an unauthenticated request with 401", async () => {
    const res = await apiFetch(
      "/api/registrations/00000000-0000-0000-0000-000000000000/complete",
      {
        method: "POST",
        body: JSON.stringify({
          waiverAccepted: true,
          waiverSignature: "Nobody",
        }),
      },
    );
    expect(res.status).toBe(401);
  });

  it("rejects a malformed registration id with 400 instead of a DB error", async () => {
    const cookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!",
    );
    const res = await apiFetch("/api/registrations/not-a-uuid/complete", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Complete Flow",
      }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("Invalid registration id");
  });

  it("signs the waiver on the happy path, then is idempotent on a repeat call", async () => {
    // In-range DOB (adult 18+ season) — stored on the dependent at creation.
    const { registrationId, cookie } = await mintOwnedRegistration("1990-05-15");

    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Complete Flow",
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

  // Youth's post-payment waiver runs through this same endpoint, with a
  // DEPENDENT registrant and the guardian's name as the signature. The two
  // things that make that legally sound are asserted here: the personal
  // consent type must be `parental` (never `age_confirmation`, which would
  // record a child as having confirmed their own age), and the signature must
  // land on both the consent rows and the registration.
  it("takes the parental (never age_confirmation) branch and stamps the waiver for a DEPENDENT registrant", async () => {
    const { registrationId, familyMemberId, cookie } =
      await mintOwnedRegistration("2016-04-01");
    const signature = `Guardian Sig ${Date.now()}`;

    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: signature,
      }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).signed).toBe(true);

    const db = getDb();

    const [reg] = await db
      .select({
        waiverSigned: registrations.waiverSigned,
        waiverSignedBy: registrations.waiverSignedBy,
        waiverSignedAt: registrations.waiverSignedAt,
      })
      .from(registrations)
      .where(eq(registrations.id, registrationId));
    expect(reg.waiverSigned).toBe(true);
    expect(reg.waiverSignedBy).toBe(signature);
    expect(reg.waiverSignedAt).toBeTruthy();

    // Liability + media-auth are written unconditionally against this
    // registration, signed by the guardian's typed name.
    const byRegistration = await db
      .select({ type: consents.type, signedByName: consents.signedByName })
      .from(consents)
      .where(eq(consents.registrationId, registrationId));
    const registrationTypes = byRegistration.map((r) => r.type);
    expect(registrationTypes).toContain("liability");
    expect(byRegistration.every((r) => r.signedByName === signature)).toBe(true);

    // The personal consent is scoped to the PERSON, not the registration, and
    // complete.ts only writes it when one isn't already active. This fixture
    // mints the dependent through POST /api/family-members, which records the
    // COPPA `parental` consent at creation — so here the endpoint correctly
    // skips a duplicate. Either way the invariant is the same and it is the
    // one that matters: the person carries a `parental` consent and NEVER an
    // `age_confirmation` one (a child must never be recorded as having
    // confirmed their own age — that's the branch complete.ts would have
    // taken if personKind were misread as "self").
    const byPerson = await db
      .select({ type: consents.type })
      .from(consents)
      .where(eq(consents.familyMemberId, familyMemberId));
    const personTypes = byPerson.map((r) => r.type);
    expect(personTypes).toContain("parental");
    expect(personTypes).not.toContain("age_confirmation");
  });

  it("records WhatsApp marketing consent as its own opted_in row, with the shown text", async () => {
    // Compliance-critical: a reviewer compares the live form against
    // consentTextShown, so the stored sentence must be exactly the constant
    // WhatsAppConsentCheckbox renders. This endpoint is authenticated, so the
    // row is opted_in outright with no OTP promotion step.
    const { registrationId, cookie } = await mintOwnedRegistration("1990-05-15");
    const phone = `+1614555${String(Date.now()).slice(-4)}`;

    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Consent Flow",
        phone,
        smsConsent: false,
        whatsappConsent: true,
      }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select({
        channel: phoneOptIns.channel,
        status: phoneOptIns.status,
        source: phoneOptIns.optInSource,
        textShown: phoneOptIns.consentTextShown,
        optedInAt: phoneOptIns.optedInAt,
      })
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, phone));

    const whatsapp = rows.find((r) => r.channel === "whatsapp");
    expect(whatsapp, "expected a channel='whatsapp' opt-in row").toBeTruthy();
    expect(whatsapp!.status).toBe("opted_in");
    expect(whatsapp!.optedInAt).toBeTruthy();
    expect(whatsapp!.source).toBe("registration_completion");
    expect(whatsapp!.textShown).toBe(CONSENT_COPY.whatsapp);

    // The SMS box was left unchecked. It must NOT have been opted in off the
    // back of the WhatsApp tick — the two are separate legal consents.
    const sms = rows.find((r) => r.channel === "sms");
    expect(sms?.status ?? "pending").not.toBe("opted_in");
  });

  it("does not write a WhatsApp row when the box is left unchecked", async () => {
    const { registrationId, cookie } = await mintOwnedRegistration("1990-05-15");
    const phone = `+1614556${String(Date.now()).slice(-4)}`;

    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "No Consent Flow",
        phone,
        smsConsent: false,
        whatsappConsent: false,
      }),
    });
    expect(res.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select({ channel: phoneOptIns.channel })
      .from(phoneOptIns)
      .where(eq(phoneOptIns.phone, phone));
    expect(rows.some((r) => r.channel === "whatsapp")).toBe(false);
  });

  it("flags age review for a DOB outside the season's age group without blocking the sign", async () => {
    // Adult 18+ season (minAge 18) — this DOB is well under that, stored on
    // the dependent at creation (create-registration.ts enforces no
    // age-eligibility gate, so the mint itself is not rejected).
    const { registrationId, cookie } = await mintOwnedRegistration("2015-01-01");

    const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
      method: "POST",
      cookie,
      body: JSON.stringify({
        waiverAccepted: true,
        waiverSignature: "Complete Flow",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.signed).toBe(true);
    expect(body.ageReviewNeeded).toBe(true);
  });
});
