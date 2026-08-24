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
import { getDb } from "@/lib/db";
import { membershipTiers } from "@/lib/db/schema/memberships";
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

const MEMBER_RATE_CENTS = 1499;

beforeAll(async () => {
  ({ organizationId, venueId, parentUserId } = await resolveClassTestFixtures());
  cookie = await getAuthCookie(CLASS_TEST_PARENT_EMAIL, CLASS_TEST_PARENT_PASSWORD);
  // One-time hygiene for orphans from before this cleanup existed — safe
  // here since tests/api runs with fileParallelism:false.
  await sweepOrphanedTestMembershipTiers(organizationId);
});

afterAll(async () => {
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

describe("Paid make-up: allotment_exhausted → POST /api/dropin/bookings → Stripe Checkout", () => {
  itWithStripe(
    "quotes memberRateCents on 402, then creates a Checkout Session priced and tagged for the child",
    async () => {
      const suffix = `${Date.now()}-makeup`;
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

      const childId = await createTestChild(parentUserId, `MakeupChild-${suffix}`);
      await createTestChildMembership({
        userId: parentUserId,
        familyMemberId: childId,
        organizationId,
        tierId: tier.id,
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
