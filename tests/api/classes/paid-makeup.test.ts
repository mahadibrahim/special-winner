/**
 * Paid make-up path — the engine-ledger hard requirement: once a class
 * member child's monthly allotment is exhausted, `POST /api/classes/book`
 * quotes a 402 `memberRateCents`, and the parent can pay for a single extra
 * class via `POST /api/dropin/bookings { sessionId, familyMemberId }`
 * instead of waiting for the allotment to reset. This suite proves the
 * money side of that hand-off end to end:
 *
 *   1. drain a `classes_per_month: 1` child membership's allotment (one
 *      `POST /api/classes/book` "member" booking),
 *   2. confirm the SECOND booking attempt 402s with the session's
 *      `memberRateCents` (the same value a materialized session would have
 *      copied down from its class-slot template — see book.ts's file doc
 *      comment; this suite sets it directly on the session fixture the same
 *      way `book.test.ts` does, rather than materializing a real template
 *      row, since the two are byte-for-byte the same value at this layer),
 *   3. `POST /api/dropin/bookings` with that session + child returns a
 *      Stripe Checkout URL,
 *   4. retrieve the created Checkout Session via the Stripe SDK (test key)
 *      and assert its `amount_total` equals the quoted `memberRateCents`
 *      and its metadata carries `family_member_id` — the exact contract
 *      `handle-dropin-checkout-complete.ts`'s webhook fulfillment core reads
 *      to record the paid make-up booking against the CHILD, not the payer.
 *
 * Webhook completion (checkout.session.completed → a confirmed
 * drop_in_bookings row) is explicitly OUT OF SCOPE here — this suite only
 * proves the checkout session Stripe receives is priced and tagged
 * correctly. Webhook fulfillment for the dropin_booking metadata contract
 * (including the family_member_id thread-through) is covered by
 * webhook/handle-dropin-checkout-complete tests elsewhere in the suite.
 *
 * amount_total === memberRateCents relies on the card surcharge currently
 * being zeroed (CARD_SURCHARGE_RATE / CARD_SURCHARGE_FLAT_CENTS = 0 in
 * src/lib/payments/surcharge.ts — "absorbing card processing fees this
 * round"). If that's ever restored, this assertion needs the surcharge
 * added back in.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Stripe from "stripe";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { consents } from "@/lib/db/schema/consents";
import { membershipTiers } from "@/lib/db/schema/memberships";
import { WAIVER_VALID_DAYS, hasValidLiabilityWaiver } from "@/lib/consents/liability";
import { handleDropInCheckoutComplete } from "@/lib/stripe/handle-dropin-checkout-complete";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import {
  resolveClassTestFixtures,
  createTestChild,
  createTestChildMembership,
  sweepOrphanedTestMembershipTiers,
  cleanupTestMembershipTiers,
  CLASS_TEST_PARENT_EMAIL,
  CLASS_TEST_PARENT_PASSWORD,
  CLASS_TEST_WAIVER,
} from "../../utils/classes-helpers";

// Same Stripe-configured gate every other paid-flow suite uses.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithStripe = stripeConfigured ? it : it.skip;
const stripe = stripeConfigured ? new Stripe(process.env.STRIPE_SECRET_KEY!) : null;

let organizationId: string;
let venueId: string;
let parentUserId: string;
let cookie: string;

// This file's own cap-1 membership tier (mirrors cron-materialize.test.ts's
// pattern) — the shared "Test Class Tier 4" fixture from
// resolveClassTestFixtures grants 4 classes/month, which would need 4 prior
// bookings to exhaust. A tier this file owns, capped at 1, drains in a
// single booking.
const createdTierIds: string[] = [];

/** Children the annual-waiver suite below creates — every consents row and
 *  booking row written against them is deleted in `afterAll` (the shared
 *  staging DB accumulates rows across runs, and a leaked `consents` row would
 *  silently satisfy a LATER run's "no waiver on file" fixture). */
const waiverChildIds: string[] = [];

const MEMBER_RATE_CENTS = 1499;

const DAY_MS = 24 * 60 * 60 * 1000;

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
  // One-time hygiene for orphans from before this cleanup existed — safe
  // here since tests/api runs with fileParallelism:false.
  await sweepOrphanedTestMembershipTiers(organizationId);
});

afterAll(async () => {
  const db = getDb();
  if (waiverChildIds.length > 0) {
    await db.delete(consents).where(inArray(consents.familyMemberId, waiverChildIds));
    await db
      .delete(dropInBookings)
      .where(inArray(dropInBookings.familyMemberId, waiverChildIds));
  }
  await cleanupTestMembershipTiers(createdTierIds);
});

function hoursFromNow(hours: number): Date {
  return new Date(Date.now() + hours * 3_600_000);
}

async function createClassSession(startsAt: Date): Promise<string> {
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt,
    memberRateCents: MEMBER_RATE_CENTS,
  });
  return ctx.sessionId;
}

/** A class session carrying BOTH class rates, so the paid door prices it for
 *  a child with no membership (the plain public class rate) as well as for a
 *  member child. `createClassSession` above sets only the member rate, which
 *  409s `class_rate_not_configured` on the no-membership branch. */
async function createPublicPricedClassSession(startsAt: Date): Promise<string> {
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt,
    sessionRateCents: MEMBER_RATE_CENTS,
    memberRateCents: MEMBER_RATE_CENTS,
  });
  return ctx.sessionId;
}

/** A class session whose template left BOTH rates unset — the config error
 *  the `class_rate_not_configured` guard exists for. `createTestDropInSession`
 *  defaults both rate columns to null, so this is just the explicit spelling. */
async function createUnpricedClassSession(startsAt: Date): Promise<string> {
  const ctx = await createTestDropInSession({
    organizationId,
    venueId,
    kind: "class",
    capacity: 10,
    startsAt,
    sessionRateCents: null,
    memberRateCents: null,
  });
  return ctx.sessionId;
}

/** Creates this file's own `classes_per_month: 1` tier (drains in a single
 *  booking) and registers it for `afterAll` cleanup. */
async function createCapOneTier(suffix: string): Promise<string> {
  const db = getDb();
  const [tier] = await db
    .insert(membershipTiers)
    .values({
      organizationId,
      name: `Makeup Tier 1 - ${suffix}`,
      monthlyPriceCents: 5000,
      benefits: { classes_per_month: 1 },
      isActive: true,
    })
    .returning();
  createdTierIds.push(tier.id);
  return tier.id;
}

describe("Paid make-up: allotment_exhausted → POST /api/dropin/bookings → Stripe Checkout", () => {
  itWithStripe(
    "quotes memberRateCents on 402, then creates a Checkout Session priced and tagged for the child",
    async () => {
      const suffix = `${Date.now()}-makeup`;
      const tierId = await createCapOneTier(suffix);

      const childId = await createTestChild(parentUserId, `MakeupChild-${suffix}`);
      await createTestChildMembership({
        userId: parentUserId,
        familyMemberId: childId,
        organizationId,
        tierId,
        idSuffix: `makeup-${suffix}`,
      });

      // 1. Drain the single-class allotment.
      const firstSessionId = await createClassSession(hoursFromNow(5 * 24));
      const firstRes = await apiFetch("/api/classes/book", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          sessionId: firstSessionId,
          familyMemberId: childId,
          kind: "member",
          waiver: CLASS_TEST_WAIVER,
        }),
      });
      expect(firstRes.status).toBe(200);
      const firstBody = await firstRes.json();
      expect(firstBody.paymentMethod).toBe("member_allotment");

      // 2. A second class 402s with the session's memberRateCents.
      const secondSessionId = await createClassSession(hoursFromNow(6 * 24));
      const exhaustedRes = await apiFetch("/api/classes/book", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          sessionId: secondSessionId,
          familyMemberId: childId,
          kind: "member",
        }),
      });
      expect(exhaustedRes.status).toBe(402);
      const exhaustedBody = await exhaustedRes.json();
      expect(exhaustedBody.error).toBe("allotment_exhausted");
      expect(exhaustedBody.memberRateCents).toBe(MEMBER_RATE_CENTS);

      // 3. Pay for the make-up class instead — hosted Checkout.
      const checkoutRes = await apiFetch("/api/dropin/bookings", {
        method: "POST",
        cookie,
        body: JSON.stringify({
          sessionId: secondSessionId,
          familyMemberId: childId,
        }),
      });
      expect(checkoutRes.status).toBe(200);
      const checkoutBody = await checkoutRes.json();
      expect(checkoutBody.paymentRequired).toBe(true);
      expect(typeof checkoutBody.checkoutUrl).toBe("string");
      expect(typeof checkoutBody.checkoutSessionId).toBe("string");

      // 4. Inspect the Stripe Checkout Session directly — the price the
      // customer is actually being asked to pay, and the metadata the
      // webhook fulfillment core reads to attribute the booking to the
      // CHILD (family_member_id), not just the paying parent (user_id).
      const stripeSession = await stripe!.checkout.sessions.retrieve(
        checkoutBody.checkoutSessionId,
      );
      expect(stripeSession.amount_total).toBe(MEMBER_RATE_CENTS);
      expect(stripeSession.metadata?.family_member_id).toBe(childId);
      expect(stripeSession.metadata?.session_id).toBe(secondSessionId);
      expect(stripeSession.metadata?.user_id).toBe(parentUserId);
    },
  );
});

/**
 * The other half of the same contract: when a class session carries NO rate
 * of its own (its class-slot template left `sessionRateCents` /
 * `memberRateCents` unset, or someone hand-made a one-off class session),
 * neither paid entry point may fall back to the org's `drop_in_rate_card` —
 * that card is the ADULT PICKUP price list, and quoting it would invoice a
 * parent for their kid's class at a price nobody configured. Both paths must
 * fail loud with 409 `class_rate_not_configured`.
 *
 * No Stripe needed: the guard fires before any Checkout Session is minted,
 * so these run on every environment (unlike the priced test above).
 */
describe("Unpriced class session → 409 class_rate_not_configured (never the adult rate card)", () => {
  it("409s on the classes/book allotment-exhausted quote instead of 402ing with the adult card rate", async () => {
    const suffix = `${Date.now()}-norate`;
    const tierId = await createCapOneTier(suffix);
    const childId = await createTestChild(parentUserId, `NoRateChild-${suffix}`);
    await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `norate-${suffix}`,
    });

    // Drain the single-class allotment (a $0 member booking — rates are
    // irrelevant to it, so the drain session can be unpriced too).
    const drainSessionId = await createUnpricedClassSession(hoursFromNow(5 * 24));
    const drainRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: drainSessionId,
        familyMemberId: childId,
        kind: "member",
        waiver: CLASS_TEST_WAIVER,
      }),
    });
    expect(drainRes.status).toBe(200);

    // The next class would be a paid make-up — but there is no class price
    // to quote. 409, NOT a 402 carrying dropInRateCard.defaultMemberRateCents.
    const unpricedSessionId = await createUnpricedClassSession(hoursFromNow(6 * 24));
    const quoteRes = await apiFetch("/api/classes/book", {
      method: "POST",
      cookie,
      body: JSON.stringify({
        sessionId: unpricedSessionId,
        familyMemberId: childId,
        kind: "member",
      }),
    });
    expect(quoteRes.status).toBe(409);
    const quoteBody = await quoteRes.json();
    expect(quoteBody.error).toBe("class_rate_not_configured");
    expect(typeof quoteBody.message).toBe("string");
    expect(quoteBody.memberRateCents).toBeUndefined();

    // Same session through the PAID path (member-rate branch — the child's
    // membership is active, just out of allotment): also 409, no checkout.
    const payRes = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: unpricedSessionId, familyMemberId: childId }),
    });
    expect(payRes.status).toBe(409);
    const payBody = await payRes.json();
    expect(payBody.error).toBe("class_rate_not_configured");
    expect(payBody.checkoutUrl).toBeUndefined();
    expect(payBody.clientSecret).toBeUndefined();
  });

  it("409s the paid path for a child with no membership (public-rate branch)", async () => {
    const suffix = `${Date.now()}-norate-nomem`;
    const childId = await createTestChild(parentUserId, `NoRateNoMemChild-${suffix}`);
    const unpricedSessionId = await createUnpricedClassSession(hoursFromNow(7 * 24));

    const payRes = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: unpricedSessionId, familyMemberId: childId }),
    });
    expect(payRes.status).toBe(409);
    const payBody = await payRes.json();
    expect(payBody.error).toBe("class_rate_not_configured");
    expect(payBody.checkoutUrl).toBeUndefined();
  });

  it("leaves the PICKUP rate-card fallback intact — an unpriced pickup session still quotes the card", async () => {
    // The guard is scoped to kind='class'. An unpriced ADULT pickup session
    // must still resolve its price from drop_in_rate_card exactly as before
    // (defaultSessionRateCents), i.e. a real Checkout/PaymentIntent path,
    // never a 409.
    const db = getDb();
    const pickup = await createTestDropInSession({
      organizationId,
      venueId,
      kind: "pickup",
      capacity: 10,
      startsAt: hoursFromNow(8 * 24),
      sessionRateCents: null,
      memberRateCents: null,
    });
    const [card] = await db
      .select({ defaultSessionRateCents: dropInRateCard.defaultSessionRateCents })
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, organizationId))
      .limit(1);

    const res = await apiFetch("/api/dropin/bookings", {
      method: "POST",
      cookie,
      body: JSON.stringify({ sessionId: pickup.sessionId, paymentFlow: "embedded" }),
    });
    const body = await res.json();
    expect(body.error).not.toBe("class_rate_not_configured");
    expect(res.status).not.toBe(409);
    // When it does take the paid branch (the parent test account holds no
    // free-pickup membership in the seed, so it should), the amount is the
    // rate card's default — proof the pickup fallback still fires.
    if (res.status === 200 && body.paymentRequired === true) {
      expect(body.amountCents).toBe(card.defaultSessionRateCents);
    }
  });
});

/**
 * ANNUAL WAIVER on the PAID child door (`POST /api/dropin/bookings` with
 * `familyMemberId` → Stripe → `fulfillDropInBookingPayment`).
 *
 * The free child door (`/api/classes/book`) already honours the canonical
 * annual predicate: a child with a valid `consents` row is never asked to
 * re-sign. The paid door had no such notion — every paid make-up landed
 * `waiverSigned: false` even for a family who signed a fortnight ago, and a
 * signature collected at the paid door was written onto the booking row only,
 * never into `consents`. Both halves are covered here:
 *
 *   (a) valid waiver + no client waiver fields → the endpoint stamps
 *       `waiver_on_file` into the checkout metadata and fulfillment writes
 *       `waiverSigned: true, waiverSignedBy: "On file (annual waiver)"`;
 *   (b) NO valid waiver + no client fields → the booking is still created
 *       (the server stays permissive — post-payment waiver capture is the
 *       backstop, matching the adult drop-in posture) but `waiverSigned` is
 *       false, which is what makes the client-side panel the real gate;
 *   (c) a FRESH client signature → fulfillment writes the canonical
 *       `consents` row, carrying the ip/user-agent captured at the BOOKING
 *       endpoint (the webhook has no request context of its own).
 *
 * Fulfillment is driven by calling `handleDropInCheckoutComplete` directly
 * with a synthetic `Stripe.Checkout.Session` — the pattern in
 * tests/api/class-pack-purchase.test.ts and tests/api/webhooks/
 * dropin-checkout.test.ts. A real webhook delivery is unreachable from an
 * API test, and the handler is the whole contract.
 */
const WAIVER_ON_FILE_ATTRIBUTION = "On file (annual waiver)";

/** Direct `consents` insert — the row shape a real signature produces
 *  (`expiresAt = signedAt + WAIVER_VALID_DAYS`), with the age of the
 *  signature as the only knob. Mirrors tests/api/consents-liability.test.ts. */
async function insertLiabilityConsent(opts: {
  familyMemberId: string;
  signedDaysAgo: number;
}): Promise<void> {
  const signedAt = new Date(Date.now() - opts.signedDaysAgo * DAY_MS);
  await getDb()
    .insert(consents)
    .values({
      familyMemberId: opts.familyMemberId,
      organizationId,
      type: "liability",
      status: "granted",
      signedByUserId: parentUserId,
      signedByName: "Parent Test",
      signedAt,
      expiresAt: new Date(signedAt.getTime() + WAIVER_VALID_DAYS * DAY_MS),
    });
}

async function newWaiverChild(label: string): Promise<string> {
  const id = await createTestChild(parentUserId, `${label}-${Date.now()}`);
  waiverChildIds.push(id);
  return id;
}

/** The fulfillment metadata contract `POST /api/dropin/bookings` stamps for a
 *  paid CHILD booking, on a realistic completed payment-mode Checkout Session.
 *  Only the fields the handler reads are real. */
function makeChildCheckoutSession(o: {
  dropInSessionId: string;
  familyMemberId: string;
  paymentIntentId: string;
  waiverOnFile?: boolean;
  waiverName?: string;
  waiverIp?: string;
  waiverUa?: string;
}): Stripe.Checkout.Session {
  return {
    id: `cs_test_${o.paymentIntentId}`,
    object: "checkout.session",
    amount_total: MEMBER_RATE_CENTS,
    currency: "usd",
    payment_intent: o.paymentIntentId,
    payment_status: "paid",
    status: "complete",
    mode: "payment",
    metadata: {
      type: "dropin_booking",
      session_id: o.dropInSessionId,
      user_id: parentUserId,
      organization_id: organizationId,
      payment_method: "card_online",
      membership_id: "",
      family_member_id: o.familyMemberId,
      waiver_signed_at: o.waiverName ? new Date().toISOString() : "",
      waiver_name: o.waiverName ?? "",
      ...(o.waiverOnFile ? { waiver_on_file: "1" } : {}),
      ...(o.waiverIp ? { waiver_ip: o.waiverIp } : {}),
      ...(o.waiverUa ? { waiver_ua: o.waiverUa } : {}),
    },
  } as unknown as Stripe.Checkout.Session;
}

async function bookingForSession(sessionId: string) {
  const [row] = await getDb()
    .select()
    .from(dropInBookings)
    .where(eq(dropInBookings.sessionId, sessionId))
    .limit(1);
  return row;
}

describe("Paid child door — annual waiver stamping at the booking endpoint", () => {
  itWithStripe(
    "stamps waiver_on_file when the child's annual waiver is still valid",
    async () => {
      const childId = await newWaiverChild("WaiverOnFileChild");
      await insertLiabilityConsent({ familyMemberId: childId, signedDaysAgo: 14 });

      const sessionId = await createPublicPricedClassSession(hoursFromNow(9 * 24));
      const res = await apiFetch("/api/dropin/bookings", {
        method: "POST",
        cookie,
        body: JSON.stringify({ sessionId, familyMemberId: childId }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      const stripeSession = await stripe!.checkout.sessions.retrieve(body.checkoutSessionId);
      expect(stripeSession.metadata?.waiver_on_file).toBe("1");
      // No signature was collected in THIS request — the on-file stamp is a
      // pointer to the consents row, not a claim that someone just signed.
      expect(stripeSession.metadata?.waiver_name).toBe("");
    },
  );

  itWithStripe(
    "does NOT stamp waiver_on_file when the only signature has expired",
    async () => {
      const childId = await newWaiverChild("WaiverExpiredChild");
      await insertLiabilityConsent({
        familyMemberId: childId,
        signedDaysAgo: WAIVER_VALID_DAYS + 30,
      });

      const sessionId = await createPublicPricedClassSession(hoursFromNow(10 * 24));
      const res = await apiFetch("/api/dropin/bookings", {
        method: "POST",
        cookie,
        body: JSON.stringify({ sessionId, familyMemberId: childId }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      const stripeSession = await stripe!.checkout.sessions.retrieve(body.checkoutSessionId);
      expect(stripeSession.metadata?.waiver_on_file ?? "").toBe("");
    },
  );

  itWithStripe(
    "threads the signing ip/user-agent into metadata, truncated to Stripe's 500-char limit",
    async () => {
      const childId = await newWaiverChild("WaiverFreshSigChild");
      const sessionId = await createPublicPricedClassSession(hoursFromNow(11 * 24));
      // Real-world UA strings can exceed Stripe's 500-char metadata value cap;
      // an over-long value makes the whole payment create throw, which would
      // turn a signature into a failed checkout.
      const longUa = `Mozilla/5.0 ${"x".repeat(700)}`;

      const res = await apiFetch("/api/dropin/bookings", {
        method: "POST",
        cookie,
        headers: { "user-agent": longUa },
        body: JSON.stringify({
          sessionId,
          familyMemberId: childId,
          waiverAccepted: true,
          waiverName: "Parent Test",
        }),
      });
      expect(res.status).toBe(200);
      const body = await res.json();

      const stripeSession = await stripe!.checkout.sessions.retrieve(body.checkoutSessionId);
      expect(stripeSession.metadata?.waiver_name).toBe("Parent Test");
      expect(stripeSession.metadata?.waiver_ua?.length).toBe(500);
      expect(stripeSession.metadata?.waiver_ua?.startsWith("Mozilla/5.0 ")).toBe(true);
    },
  );
});

/**
 * The client half of the same door: the drop-in modal only skips its guardian
 * waiver panel when the child-list endpoint says the child is covered. That
 * flag is opt-in (`?includeWaiver=1`) so the registration wizard and dashboard
 * keep their unchanged, un-probed payload.
 */
describe("GET /api/family-members?includeWaiver=1 — the modal's waiver probe", () => {
  it("reports waiverOnFile per person, and only when asked", async () => {
    const coveredId = await newWaiverChild("ProbeCoveredChild");
    const uncoveredId = await newWaiverChild("ProbeUncoveredChild");
    await insertLiabilityConsent({ familyMemberId: coveredId, signedDaysAgo: 3 });

    const probed = await apiFetch("/api/family-members?includeWaiver=1", { cookie });
    expect(probed.status).toBe(200);
    const probedBody = await probed.json();
    const byId = new Map<string, any>(
      probedBody.familyMembers.map((m: any) => [m.id, m]),
    );
    expect(byId.get(coveredId)?.waiverOnFile).toBe(true);
    expect(byId.get(uncoveredId)?.waiverOnFile).toBe(false);

    // Unprobed callers see no such field at all — an absent flag reads as
    // "ask for a signature" on the client, i.e. the pre-change behaviour.
    const plain = await apiFetch("/api/family-members", { cookie });
    expect(plain.status).toBe(200);
    const plainBody = await plain.json();
    const plainCovered = plainBody.familyMembers.find((m: any) => m.id === coveredId);
    expect(plainCovered).toBeDefined();
    expect(plainCovered.waiverOnFile).toBeUndefined();
  });
});

describe("Paid child door — fulfillment writes the waiver state", () => {
  it("(a) on-file metadata → confirmed booking marked signed, attributed to the annual waiver", async () => {
    const childId = await newWaiverChild("FulfilOnFileChild");
    const sessionId = await createClassSession(hoursFromNow(12 * 24));

    const result = await handleDropInCheckoutComplete(
      makeChildCheckoutSession({
        dropInSessionId: sessionId,
        familyMemberId: childId,
        paymentIntentId: `pi_test_onfile_${Date.now()}`,
        waiverOnFile: true,
      }),
    );
    expect(result.status).toBe("processed");

    const row = await bookingForSession(sessionId);
    expect(row.familyMemberId).toBe(childId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe(WAIVER_ON_FILE_ATTRIBUTION);
    // No fresh signature happened, so there is no signature DATE — and a row
    // with a date is exactly what the legacy fallback in
    // hasValidLiabilityWaiver treats as a signature. A derived copy must
    // never be able to renew the very window it was derived from.
    expect(row.waiverSignedAt).toBeNull();
    expect(row.waiverConsentVariant).toBeNull();

    // …and it wrote no consents row: the on-file branch is a READ.
    const rows = await getDb()
      .select()
      .from(consents)
      .where(and(eq(consents.familyMemberId, childId), eq(consents.type, "liability")));
    expect(rows).toHaveLength(0);
  });

  it("(b) no waiver on file and no client fields → booking still created, unsigned", async () => {
    const childId = await newWaiverChild("FulfilUnsignedChild");
    const sessionId = await createClassSession(hoursFromNow(13 * 24));

    const result = await handleDropInCheckoutComplete(
      makeChildCheckoutSession({
        dropInSessionId: sessionId,
        familyMemberId: childId,
        paymentIntentId: `pi_test_unsigned_${Date.now()}`,
      }),
    );
    expect(result.status).toBe("processed");

    const row = await bookingForSession(sessionId);
    // Permissive by design: the customer paid, so they get their spot. The
    // post-payment waiver capture surface is the backstop, exactly as it is
    // for an adult drop-in.
    expect(row.status).toBe("confirmed");
    expect(row.waiverSigned).toBe(false);
    expect(row.waiverSignedBy).toBeNull();
  });

  it("(c) fresh client signature → canonical consents row with the ip/UA from metadata", async () => {
    const childId = await newWaiverChild("FulfilFreshSigChild");
    const sessionId = await createClassSession(hoursFromNow(14 * 24));

    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(false);

    const result = await handleDropInCheckoutComplete(
      makeChildCheckoutSession({
        dropInSessionId: sessionId,
        familyMemberId: childId,
        paymentIntentId: `pi_test_freshsig_${Date.now()}`,
        waiverName: "Parent Test",
        waiverIp: "203.0.113.9",
        waiverUa: "vitest-paid-door",
      }),
    );
    expect(result.status).toBe("processed");

    const row = await bookingForSession(sessionId);
    expect(row.waiverSigned).toBe(true);
    expect(row.waiverSignedBy).toBe("Parent Test");
    expect(row.waiverSignedAt).not.toBeNull();
    // Child paid path is always a guardian signing for a minor.
    expect(row.waiverConsentVariant).toBe("guardian");

    const [consent] = await getDb()
      .select()
      .from(consents)
      .where(and(eq(consents.familyMemberId, childId), eq(consents.type, "liability")))
      .orderBy(desc(consents.signedAt))
      .limit(1);
    expect(consent).toBeDefined();
    expect(consent.organizationId).toBe(organizationId);
    expect(consent.status).toBe("granted");
    expect(consent.signedByUserId).toBe(parentUserId);
    expect(consent.signedByName).toBe("Parent Test");
    // The webhook has no request context — ip/UA can only reach it through
    // the checkout metadata the booking endpoint stamped.
    expect(consent.ipAddress).toBe("203.0.113.9");
    expect(consent.userAgent).toBe("vitest-paid-door");
    expect(consent.notes).toContain("guardian");

    // The write satisfies the read — this child's NEXT paid booking takes the
    // on-file branch instead of asking again.
    expect(await hasValidLiabilityWaiver(childId, organizationId)).toBe(true);
  });
});
