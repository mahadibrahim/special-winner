/**
 * GET/POST /api/dropin/claim/:token — CLASS session re-pricing (carried
 * item from F1's review of the waiver-ladder-followups plan).
 *
 * A promoted-overflow claim (the seat was refunded when the session filled,
 * see the file's own header doc) re-prices what the claimant owes to
 * confirm. For a `kind='class'` session this used to go through
 * `resolveRate` + the org `drop_in_rate_card` — the ADULT PICKUP price
 * list — exactly the bug class-rate.ts/class-walkup.ts exist to prevent
 * everywhere else. This suite proves the claim path now goes through the
 * same shared module (src/lib/classes/class-walkup.ts), keyed to the
 * booking's PARTICIPANT (`family_member_id`), never the card and never the
 * claimant's own adult membership.
 *
 * Loud, distinctive rate-card values (mirrors
 * tests/api/kiosk/walkin-class-pricing.test.ts) so any leak of the adult
 * card into a class claim quote is unmistakable.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInRateCard } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { computeSurchargeCents } from "@/lib/payments/surcharge";
import { CLASS_RATE_NOT_CONFIGURED } from "@/lib/classes/class-rate";
import { CLASS_REQUIRES_CHILD } from "@/lib/classes/class-walkup";
import { apiFetch, expectJson, getParentCookie } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { CLASS_TEST_PARENT_EMAIL } from "../../utils/classes-helpers";

const CARD_SESSION_CENTS = 91373;
const CARD_MEMBER_CENTS = 91374;

const CLASS_SESSION_CENTS = 3300;

let defaultOrg: { organizationId: string; venueId: string };
let parentUserId: string;
let originalCard: {
  defaultSessionRateCents: number;
  defaultMemberRateCents: number;
  defaultWalkUpRateCents: number;
} | null = null;

/** A promoted overflow row in the exact state the claim flow produces:
 *  pending_claim, original charge recorded, overflow refund recorded — same
 *  shape as claim-payment-webhook.test.ts's seedPromotedOverflowRow, plus a
 *  familyMemberId for the class-participant scenarios. */
async function seedPromotedOverflowClaim(opts: {
  sessionId: string;
  userId: string;
  familyMemberId?: string | null;
}) {
  const token = `tok_class_claim_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  const [row] = await getDb()
    .insert(dropInBookings)
    .values({
      sessionId: opts.sessionId,
      userId: opts.userId,
      familyMemberId: opts.familyMemberId ?? null,
      status: "pending_claim",
      source: "online_booking",
      paymentMethod: "card_online",
      amountPaidCents: CLASS_SESSION_CENTS,
      waitlistPriority: 100,
      stripePaymentIntentId: `pi_test_class_claim_${Date.now()}`,
      stripeRefundId: `re_test_class_claim_${Date.now()}`,
      promotedAt: new Date(),
      promotionExpiresAt: new Date(Date.now() + 30 * 60_000),
      promotionToken: token,
    })
    .returning();
  return { row, token };
}

describe("GET/POST /api/dropin/claim/:token — CLASS pricing", () => {
  beforeAll(async () => {
    defaultOrg = await resolveDefaultOrgForHttpTests();
    const db = getDb();

    const [parent] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, CLASS_TEST_PARENT_EMAIL))
      .limit(1);
    if (!parent) {
      throw new Error(
        `${CLASS_TEST_PARENT_EMAIL} is not seeded — run npm run db:seed:e2e first`,
      );
    }
    parentUserId = parent.id;

    await db
      .insert(dropInRateCard)
      .values({ organizationId: defaultOrg.organizationId })
      .onConflictDoNothing();
    const [card] = await db
      .select({
        defaultSessionRateCents: dropInRateCard.defaultSessionRateCents,
        defaultMemberRateCents: dropInRateCard.defaultMemberRateCents,
        defaultWalkUpRateCents: dropInRateCard.defaultWalkUpRateCents,
      })
      .from(dropInRateCard)
      .where(eq(dropInRateCard.organizationId, defaultOrg.organizationId))
      .limit(1);
    originalCard = card ?? null;
    await db
      .update(dropInRateCard)
      .set({
        defaultSessionRateCents: CARD_SESSION_CENTS,
        defaultMemberRateCents: CARD_MEMBER_CENTS,
      })
      .where(eq(dropInRateCard.organizationId, defaultOrg.organizationId));
  });

  afterAll(async () => {
    if (!originalCard) return;
    await getDb()
      .update(dropInRateCard)
      .set(originalCard)
      .where(eq(dropInRateCard.organizationId, defaultOrg.organizationId));
  });

  it("GET quotes amountDueCents from the class session's own rate, never the card", async () => {
    const childId = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId,
        firstName: `ClaimClassChild${Date.now()}`,
        lastName: "Test",
        birthDate: "2016-01-01",
      })
      .returning({ id: familyMembers.id })
      .then((r) => r[0].id);

    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      kind: "class",
      sessionRateCents: CLASS_SESSION_CENTS,
      memberRateCents: null,
      sportOrClassLabel: `claim-class-quote-${Date.now()}`,
    });
    const { token } = await seedPromotedOverflowClaim({
      sessionId: ctx.sessionId,
      userId: parentUserId,
      familyMemberId: childId,
    });

    const res = await apiFetch(`/api/dropin/claim/${token}`);
    const body = await expectJson(res, 200);
    expect(body.paymentRequired).toBe(true);
    const expectedTotal =
      CLASS_SESSION_CENTS + computeSurchargeCents(CLASS_SESSION_CENTS, "card");
    expect(body.amountDueCents).toBe(expectedTotal);
    expect(body.amountDueCents).not.toBe(CARD_SESSION_CENTS);
  });

  it("GET returns null amountDueCents when the class rate is unconfigured (no 500, no card fallback)", async () => {
    const childId = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId,
        firstName: `ClaimClassUnpriced${Date.now()}`,
        lastName: "Test",
        birthDate: "2016-01-01",
      })
      .returning({ id: familyMembers.id })
      .then((r) => r[0].id);

    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      kind: "class",
      sessionRateCents: null,
      memberRateCents: null,
      sportOrClassLabel: `claim-class-unpriced-${Date.now()}`,
    });
    const { token } = await seedPromotedOverflowClaim({
      sessionId: ctx.sessionId,
      userId: parentUserId,
      familyMemberId: childId,
    });

    const res = await apiFetch(`/api/dropin/claim/${token}`);
    const body = await expectJson(res, 200);
    expect(body.paymentRequired).toBe(true);
    expect(body.amountDueCents).toBeNull();
  });

  it("POST pay refuses class_requires_child (422) when the row carries no participant", async () => {
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      kind: "class",
      sessionRateCents: CLASS_SESSION_CENTS,
      memberRateCents: null,
      sportOrClassLabel: `claim-class-nochild-${Date.now()}`,
    });
    const { token } = await seedPromotedOverflowClaim({
      sessionId: ctx.sessionId,
      userId: parentUserId,
      familyMemberId: null,
    });

    const cookie = await getParentCookie();
    const res = await apiFetch(`/api/dropin/claim/${token}`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ action: "pay" }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(422);
    expect(body.error?.code).toBe(CLASS_REQUIRES_CHILD);
  });

  it("POST pay 409s class_rate_not_configured instead of quoting the adult card", async () => {
    const childId = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId,
        firstName: `ClaimClassPayUnpriced${Date.now()}`,
        lastName: "Test",
        birthDate: "2016-01-01",
      })
      .returning({ id: familyMembers.id })
      .then((r) => r[0].id);

    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      kind: "class",
      sessionRateCents: null,
      memberRateCents: null,
      sportOrClassLabel: `claim-class-pay-unpriced-${Date.now()}`,
    });
    const { token } = await seedPromotedOverflowClaim({
      sessionId: ctx.sessionId,
      userId: parentUserId,
      familyMemberId: childId,
    });

    const cookie = await getParentCookie();
    const res = await apiFetch(`/api/dropin/claim/${token}`, {
      method: "POST",
      cookie,
      body: JSON.stringify({ action: "pay" }),
    });
    const body = await res.json();
    expect(res.status, JSON.stringify(body)).toBe(409);
    expect(body.error).toBe(CLASS_RATE_NOT_CONFIGURED);
  });

  it("zero-due class claim (member rate is $0) confirms directly with the child's membership — no Stripe", async () => {
    const childId = await getDb()
      .insert(familyMembers)
      .values({
        parentUserId,
        firstName: `ClaimClassZeroDue${Date.now()}`,
        lastName: "Test",
        birthDate: "2016-01-01",
      })
      .returning({ id: familyMembers.id })
      .then((r) => r[0].id);

    const db = getDb();
    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId: defaultOrg.organizationId,
        name: `claim-class-zero-due-${Date.now()}`,
        monthlyPriceCents: 5000,
        benefits: { classes_per_month: 4 },
      })
      .returning();
    const [membershipRow] = await db
      .insert(memberships)
      .values({
        userId: parentUserId,
        familyMemberId: childId,
        organizationId: defaultOrg.organizationId,
        tierId: tier.id,
        status: "active",
        billingInterval: "month",
      })
      .returning();

    try {
      const ctx = await createTestDropInSession({
        organizationId: defaultOrg.organizationId,
        venueId: defaultOrg.venueId,
        kind: "class",
        sessionRateCents: CLASS_SESSION_CENTS,
        memberRateCents: 0,
        sportOrClassLabel: `claim-class-zero-due-${Date.now()}`,
      });
      const { token, row: claimRow } = await seedPromotedOverflowClaim({
        sessionId: ctx.sessionId,
        userId: parentUserId,
        familyMemberId: childId,
      });

      const cookie = await getParentCookie();
      const pay = await apiFetch(`/api/dropin/claim/${token}`, {
        method: "POST",
        cookie,
        body: JSON.stringify({ action: "pay" }),
      });
      const payBody = await pay.json();
      expect(pay.status, JSON.stringify(payBody)).toBe(200);
      expect(payBody.ok).toBe(true);
      expect(payBody.checkoutUrl).toBeUndefined();

      const [confirmed] = await db
        .select()
        .from(dropInBookings)
        .where(eq(dropInBookings.id, claimRow.id));
      expect(confirmed.status).toBe("confirmed");
      // The class module's payment method — never resolveRate's
      // "member_unlimited"/"member_allotment", which belong to the pickup
      // benefit machinery, not a class credit discount.
      expect(confirmed.paymentMethod).toBe("card_online");
      expect(confirmed.membershipId).toBe(membershipRow.id);
      expect(confirmed.amountPaidCents).toBe(0);
      expect(confirmed.promotionToken).toBeNull();
    } finally {
      await db.delete(memberships).where(eq(memberships.id, membershipRow.id));
      await db.delete(membershipTiers).where(eq(membershipTiers.id, tier.id));
    }
  });
});
