import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAuthCookie } from "./setup/test-helpers";
import { getDb } from "@/lib/db";
import {
  seasons,
  programs,
  locations,
  registrations,
  consents,
} from "@/lib/db/schema";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { CONSENT_COPY } from "@/lib/consents/marketing-channels";
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  WAIVER_VALID_DAYS,
} from "@/lib/consents/liability";
import { completionWaiverAssentText } from "@/lib/registrations/waiver-text";
import { familyMembers } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

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
/** Owning org of that season. Waivers are org-scoped legal releases, so the
 *  annual-waiver cases below must seed their consents row against THIS org. */
let adultSeasonOrgId: string;

beforeAll(async () => {
  const db = getDb();
  const [season] = await db
    .select({ id: seasons.id, organizationId: locations.organizationId })
    .from(seasons)
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(eq(seasons.slug, ADULT_OPEN_SEASON_SLUG))
    .limit(1);

  if (!season?.organizationId) {
    throw new Error(
      `Adult open soccer season (slug: ${ADULT_OPEN_SEASON_SLUG}) or its owning org not found — re-run npm run db:seed:e2e`,
    );
  }
  adultSeasonId = season.id;
  adultSeasonOrgId = season.organizationId;
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
    participantName: string;
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
    return {
      registrationId: regBody.registration.id,
      familyMemberId,
      // Exactly what both surfaces pass CompletionForm as `participantName`,
      // and what the server rebuilds to compose the recorded assent text.
      participantName: `Complete Fixture${stamp}`,
      cookie,
    };
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

  // ANNUAL WAIVER. `registrations.waiverSigned` is per-REGISTRATION, so it is
  // false on every new row even for a family already covered at this org. The
  // registration is normally born stamped (create-registration.ts), so the
  // branch these two cover is the TRANSITION one: the row existed BEFORE the
  // signature landed, which is why each mints the registration first and only
  // then inserts the consent.
  describe("annual waiver on file", () => {
    async function insertLiabilityConsent(
      familyMemberId: string,
      signerUserId: string,
    ): Promise<void> {
      const signedAt = new Date(Date.now() - 30 * 86_400_000);
      await getDb().insert(consents).values({
        familyMemberId,
        organizationId: adultSeasonOrgId,
        type: "liability",
        status: "granted",
        signedByUserId: signerUserId,
        signedByName: "Parent Test",
        signedAt,
        expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * 86_400_000),
      });
    }

    it("short-circuits alreadySigned and stamps the row on-file, logging no new consent", async () => {
      const { registrationId, familyMemberId, cookie } =
        await mintOwnedRegistration("2016-04-01");

      const db = getDb();
      const [reg] = await db
        .select({ signerUserId: registrations.registeredByUserId })
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      await insertLiabilityConsent(familyMemberId, reg.signerUserId);

      const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
        method: "POST",
        cookie,
        body: JSON.stringify({
          waiverAccepted: true,
          waiverSignature: "Redundant Signer",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadySigned).toBe(true);
      expect(body.signed).toBeUndefined();

      const [row] = await db
        .select({
          waiverSigned: registrations.waiverSigned,
          waiverSignedBy: registrations.waiverSignedBy,
          waiverSignedAt: registrations.waiverSignedAt,
        })
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      expect(row.waiverSigned).toBe(true);
      expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
      // Load-bearing: hasValidLiabilityWaiver's legacy `registrations`
      // fallback accepts any DATED signed row, so a dated derived copy would
      // renew the very window it was derived from.
      expect(row.waiverSignedAt).toBeNull();

      // consents is append-only and does not dedupe — this branch is a READ.
      const liability = await db
        .select({ id: consents.id })
        .from(consents)
        .where(
          and(
            eq(consents.familyMemberId, familyMemberId),
            eq(consents.type, "liability"),
          ),
        );
      expect(liability).toHaveLength(1);
    });

    // FINDING 3 regression. Before the endpoint was restructured, an
    // already-signed registration returned before the marketing block. The
    // restructure made that block reachable on a replay, where
    // recordMarketingConsent PROMOTES a channel to opted_in — i.e. a replayed
    // POST could silently undo an opt-out the customer set afterwards.
    it("a repeat POST on an already-signed registration cannot re-opt-in a channel the customer opted out of", async () => {
      const { registrationId, cookie } = await mintOwnedRegistration("1990-05-15");
      const phone = `+1614557${String(Date.now()).slice(-4)}`;
      const db = getDb();

      // 1. Real completion, WhatsApp ticked → an opted_in row exists.
      const first = await apiFetch(`/api/registrations/${registrationId}/complete`, {
        method: "POST",
        cookie,
        body: JSON.stringify({
          waiverAccepted: true,
          waiverSignature: "Opt Out Flow",
          phone,
          smsConsent: false,
          whatsappConsent: true,
        }),
      });
      expect((await first.json()).signed).toBe(true);

      // 2. The customer opts out afterwards — the state the replay must not
      //    clobber. Written directly: this asserts the endpoint's behaviour,
      //    not the opt-out UI's.
      await db
        .update(phoneOptIns)
        .set({ status: "opted_out", optedOutAt: new Date(), updatedAt: new Date() })
        .where(
          and(eq(phoneOptIns.phone, phone), eq(phoneOptIns.channel, "whatsapp")),
        );

      // 3. Replay the identical completion. The registration is already
      //    signed, so this is the branch that must touch no consent state.
      const replay = await apiFetch(`/api/registrations/${registrationId}/complete`, {
        method: "POST",
        cookie,
        body: JSON.stringify({
          waiverAccepted: true,
          waiverSignature: "Opt Out Flow",
          phone,
          smsConsent: true,
          whatsappConsent: true,
        }),
      });
      expect((await replay.json()).alreadySigned).toBe(true);

      const rows = await db
        .select({ channel: phoneOptIns.channel, status: phoneOptIns.status })
        .from(phoneOptIns)
        .where(eq(phoneOptIns.phone, phone));
      const whatsapp = rows.find((r) => r.channel === "whatsapp");
      expect(
        whatsapp!.status,
        "a replayed completion must never resurrect an opt-out",
      ).toBe("opted_out");
      // The SMS tick on the replay must not have created an opted_in row
      // either — same rule, same branch.
      const sms = rows.find((r) => r.channel === "sms");
      expect(sms?.status ?? "pending").not.toBe("opted_in");
    });

    // FINDING 4. A covered participant is shown no waiver text and no
    // signature box, so its form submits only the outstanding items. The
    // endpoint must accept that body and still backfill the DOB.
    it("accepts a DOB-only submission (no waiver fields) and backfills the birth date", async () => {
      const { registrationId, familyMemberId, cookie } =
        await mintOwnedRegistration("2016-04-01");

      const db = getDb();
      // Clear the DOB so this registration is in the real state the DOB-only
      // form exists for: waiver settled, birth date still owed.
      await db
        .update(familyMembers)
        .set({ birthDate: null })
        .where(eq(familyMembers.id, familyMemberId));
      const [reg] = await db
        .select({ signerUserId: registrations.registeredByUserId })
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      await insertLiabilityConsent(familyMemberId, reg.signerUserId);

      const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
        method: "POST",
        cookie,
        body: JSON.stringify({ birthDate: "2016-04-01" }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.alreadySigned).toBe(true);
      expect(body.signed).toBeUndefined();
      expect(body).toHaveProperty("ageReviewNeeded");

      const [person] = await db
        .select({ birthDate: familyMembers.birthDate })
        .from(familyMembers)
        .where(eq(familyMembers.id, familyMemberId));
      expect(
        person.birthDate,
        "the DOB is the one thing this branch still has to collect",
      ).toBe("2016-04-01");
    });

    // ROUND-2 FINDING 1 (regression). The F3 gate was keyed on `alreadySigned`,
    // which is ALSO true on the waiver-on-file branch — so a covered family's
    // FIRST completion silently dropped its phone and marketing answers. This
    // endpoint is the only capture point for authed-flow phone opt-ins and for
    // ALL WhatsApp marketing consent, so that was a real data loss, not a
    // cosmetic one. The gate is now the PRE-REQUEST signature state.
    it("captures phone + WhatsApp consent on a FIRST completion that takes the on-file branch", async () => {
      const { registrationId, familyMemberId, cookie } =
        await mintOwnedRegistration("2016-04-01");
      const phone = `+1614558${String(Date.now()).slice(-4)}`;

      const db = getDb();
      const [reg] = await db
        .select({ signerUserId: registrations.registeredByUserId })
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      // Covered BEFORE the completion, and the row itself still unsigned —
      // exactly the state the on-file branch exists for.
      await insertLiabilityConsent(familyMemberId, reg.signerUserId);

      const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
        method: "POST",
        cookie,
        body: JSON.stringify({
          phone,
          smsConsent: true,
          whatsappConsent: true,
        }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).alreadySigned).toBe(true);

      const rows = await db
        .select({
          channel: phoneOptIns.channel,
          status: phoneOptIns.status,
          textShown: phoneOptIns.consentTextShown,
        })
        .from(phoneOptIns)
        .where(eq(phoneOptIns.phone, phone));

      const whatsapp = rows.find((r) => r.channel === "whatsapp");
      expect(
        whatsapp,
        "the on-file branch still shows the consent boxes — it must record the answer",
      ).toBeTruthy();
      expect(whatsapp!.status).toBe("opted_in");
      expect(whatsapp!.textShown).toBe(CONSENT_COPY.whatsapp);

      const sms = rows.find((r) => r.channel === "sms");
      expect(sms, "the ticked SMS box must be recorded too").toBeTruthy();
      expect(sms!.status).toBe("opted_in");
    });

    // ROUND-2 FINDING 2 (same class). recordDefaultMediaAuth only ran inside
    // the fresh-signature transaction, so a covered family's photo/video
    // opt-outs were presented and then thrown away.
    it("honors media-auth opt-outs submitted on the on-file branch", async () => {
      const { registrationId, familyMemberId, cookie } =
        await mintOwnedRegistration("2016-04-01");

      const db = getDb();
      const [reg] = await db
        .select({ signerUserId: registrations.registeredByUserId })
        .from(registrations)
        .where(eq(registrations.id, registrationId));
      await insertLiabilityConsent(familyMemberId, reg.signerUserId);

      const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
        method: "POST",
        cookie,
        body: JSON.stringify({ mediaAuthOptOuts: ["public"] }),
      });
      expect(res.status).toBe(200);
      expect((await res.json()).alreadySigned).toBe(true);

      const media = await db
        .select({ scope: consents.scope, signedByName: consents.signedByName })
        .from(consents)
        .where(
          and(
            eq(consents.familyMemberId, familyMemberId),
            eq(consents.type, "media_authorization"),
          ),
        );
      const scopes = media.map((m) => m.scope);
      // Opt-out model: a row per scope the customer did NOT disable.
      expect(scopes).toContain("internal");
      expect(scopes).toContain("promotional");
      expect(
        scopes,
        "the scope they opted out of must not be recorded as granted",
      ).not.toContain("public");
      // No signature was taken, so the shared on-file attribution stands in as
      // the signer rather than a name nobody typed.
      expect(media[0].signedByName).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    });

    it("still rejects a missing signature when one is genuinely owed", async () => {
      const { registrationId, cookie } = await mintOwnedRegistration("1990-05-15");

      const res = await apiFetch(`/api/registrations/${registrationId}/complete`, {
        method: "POST",
        cookie,
        body: JSON.stringify({ birthDate: "1990-05-15" }),
      });
      // Optional at the schema layer so the DOB-only body above parses —
      // mandatory again on the branch that actually takes a signature.
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.details?.waiverSignature).toBeTruthy();
    });

    it("writes an org-scoped, ip/UA-stamped consent for a genuinely fresh signature", async () => {
      const { registrationId, familyMemberId, participantName, cookie } =
        await mintOwnedRegistration("2016-04-01");
      const signature = `Org Scoped ${Date.now()}`;

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

      const [row] = await getDb()
        .select()
        .from(consents)
        .where(
          and(
            eq(consents.familyMemberId, familyMemberId),
            eq(consents.type, "liability"),
          ),
        );
      // The org is what makes the annual predicate work — a NULL-org row
      // satisfies nothing.
      expect(row.organizationId).toBe(adultSeasonOrgId);
      expect(row.signedByName).toBe(signature);
      // The record must quote what the SCREEN showed. This fixture is a
      // dependent, so completion-form.tsx rendered the accept label AND the
      // guardian attestation — recording the bare adult label here was the
      // misquote this assertion pins shut.
      const expectedAssent = completionWaiverAssentText(
        "guardian",
        participantName,
      );
      expect(row.notes).toContain(expectedAssent);
      expect(expectedAssent).toContain("parent or legal guardian");
      expect(row.notes).toContain("variant=guardian");
      // From THIS request's context, never the body.
      expect(row.userAgent).toBeTruthy();
      expect(row.expiresAt).toBeTruthy();
      const expected = row.signedAt.getTime() + WAIVER_VALID_DAYS * 86_400_000;
      expect(Math.abs((row.expiresAt?.getTime() ?? 0) - expected)).toBeLessThan(5000);
    });
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
