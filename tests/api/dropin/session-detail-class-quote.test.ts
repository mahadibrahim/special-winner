/**
 * GET /api/dropin/sessions/:id — CLASS session quote (spec B of the
 * waiver-ladder-followups plan, task 2).
 *
 * A `kind='class'` session must be quoted from the SESSION's own rates via
 * the shared class-walkup module (src/lib/classes/class-walkup.ts) — never
 * `resolveRate` + the org `drop_in_rate_card`, which is the ADULT PICKUP
 * price list. Mirrors the loud-rate-card sentinel pattern from
 * tests/api/kiosk/walkin-class-pricing.test.ts: the card is temporarily set
 * to LOUD, distinctive values (restored in afterAll) so any class quote that
 * leaks the adult card is unmistakable.
 *
 * Covers:
 *   - anonymous viewer → the PUBLIC session rate, never the card
 *   - an authed viewer's OWN adult unlimited_pickup membership never
 *     zeroes a class quote (that membership has nothing to do with a kid's
 *     class — see class-walkup.ts's module doc)
 *   - an authed viewer whose EXISTING booking on the session names a
 *     member CHILD sees the discounted class member rate
 *   - a null configured rate omits the quote fields (200, not 409) and
 *     never falls back to the card
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInRateCard, dropInBookings } from "@/lib/db/schema/drop-in";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { users } from "@/lib/db/schema/users";
import { familyMembers } from "@/lib/db/schema/registrations";
import { apiFetch, expectJson, getAuthCookie } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import {
  createTestChildMembership,
  resolveClassTestFixtures,
} from "../../utils/classes-helpers";

// Distinctive rate-card values: any of these appearing in a CLASS quote is a
// leak of the adult pickup price list into a kids' class.
const CARD_SESSION_CENTS = 91371;
const CARD_MEMBER_CENTS = 91372;

const CLASS_SESSION_CENTS = 3300;
const CLASS_MEMBER_CENTS = 1500;

const ADULT_UNLIMITED_EMAIL = "adult-self@test.aspiresports.com";
const ADULT_UNLIMITED_PASSWORD = "TestParent123!";

describe("GET /api/dropin/sessions/:id — CLASS quote", () => {
  let defaultOrg: { organizationId: string; venueId: string };
  let originalCard: {
    defaultSessionRateCents: number;
    defaultMemberRateCents: number;
    defaultWalkUpRateCents: number;
  } | null = null;

  beforeAll(async () => {
    defaultOrg = await resolveDefaultOrgForHttpTests();
    const db = getDb();
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

  it("anonymous viewer sees the PUBLIC session rate, never the rate card", async () => {
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      kind: "class",
      sessionRateCents: CLASS_SESSION_CENTS,
      memberRateCents: CLASS_MEMBER_CENTS,
      sportOrClassLabel: `class-quote-anon-${Date.now()}`,
    });

    const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`);
    const body = await expectJson(res, 200);
    expect(body.resolvedAmountCents).toBe(CLASS_SESSION_CENTS);
    expect(body.resolvedPaymentMethod).toBe("card_online");
    expect(body.resolvedAmountCents).not.toBe(CARD_SESSION_CENTS);
  });

  it("null sessionRateCents → quote fields omitted (200, not 409)", async () => {
    const ctx = await createTestDropInSession({
      organizationId: defaultOrg.organizationId,
      venueId: defaultOrg.venueId,
      kind: "class",
      sessionRateCents: null,
      memberRateCents: null,
      sportOrClassLabel: `class-quote-unpriced-${Date.now()}`,
    });

    const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`);
    const body = await expectJson(res, 200);
    expect(body.resolvedAmountCents).toBeNull();
    expect(body.resolvedPaymentMethod).toBeNull();
    // The rest of the public page still renders — never invents a card price.
    expect(body.resolvedAmountCents).not.toBe(CARD_SESSION_CENTS);
  });

  it("an authed viewer's OWN adult unlimited_pickup membership never zeroes a class quote", async () => {
    const cookie = await getAuthCookie(ADULT_UNLIMITED_EMAIL, ADULT_UNLIMITED_PASSWORD);
    const db = getDb();
    const [selfUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, ADULT_UNLIMITED_EMAIL))
      .limit(1);
    expect(selfUser).toBeDefined();

    // Clean slate on the shared CI DB — partial unique index allows only
    // one active membership per user+org (mirrors the zero-due claim test
    // in transactional-capacity-gate.test.ts).
    await db
      .delete(memberships)
      .where(
        and(
          eq(memberships.userId, selfUser.id),
          eq(memberships.organizationId, defaultOrg.organizationId),
        ),
      );

    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId: defaultOrg.organizationId,
        name: `class-quote-unlimited-test-${Date.now()}`,
        monthlyPriceCents: 5000,
        benefits: { unlimited_pickup: true },
      })
      .returning();
    const [membershipRow] = await db
      .insert(memberships)
      .values({
        userId: selfUser.id,
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
        memberRateCents: CLASS_MEMBER_CENTS,
        sportOrClassLabel: `class-quote-unlimited-${Date.now()}`,
      });

      const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`, { cookie });
      const body = await expectJson(res, 200);
      // Not $0 (the pickup unlimited_pickup benefit), not the card, not
      // even the member rate — this viewer has no known CHILD on this
      // session, so it's the plain public class rate.
      expect(body.resolvedAmountCents).toBe(CLASS_SESSION_CENTS);
      expect(body.resolvedAmountCents).not.toBe(0);
      expect(body.resolvedPaymentMethod).not.toBe("member_unlimited");
    } finally {
      await db.delete(memberships).where(eq(memberships.id, membershipRow.id));
      await db.delete(membershipTiers).where(eq(membershipTiers.id, tier.id));
    }
  });

  it("an authed viewer whose EXISTING booking names a MEMBER child sees the class member rate", async () => {
    const fixtures = await resolveClassTestFixtures();
    const cookie = await getAuthCookie("parent@test.aspiresports.com", "TestParent123!");

    const db = getDb();
    const childFirstName = `ClassQuoteMember${Date.now()}`;
    const [child] = await db
      .insert(familyMembers)
      .values({
        parentUserId: fixtures.parentUserId,
        firstName: childFirstName,
        lastName: "Test",
        birthDate: "2016-01-01",
      })
      .returning();

    const membershipId = await createTestChildMembership({
      userId: fixtures.parentUserId,
      familyMemberId: child.id,
      organizationId: fixtures.organizationId,
      tierId: fixtures.tierId,
      idSuffix: `class-quote-${Date.now()}`,
    });

    try {
      const ctx = await createTestDropInSession({
        organizationId: fixtures.organizationId,
        venueId: fixtures.venueId,
        kind: "class",
        sessionRateCents: CLASS_SESSION_CENTS,
        memberRateCents: CLASS_MEMBER_CENTS,
        sportOrClassLabel: `class-quote-member-${Date.now()}`,
      });

      // An existing ACTIVE booking naming the child — the "booking context"
      // the endpoint uses to know which child to price for.
      await db.insert(dropInBookings).values({
        sessionId: ctx.sessionId,
        userId: fixtures.parentUserId,
        familyMemberId: child.id,
        status: "waitlisted",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 0,
      });

      const res = await apiFetch(`/api/dropin/sessions/${ctx.sessionId}`, { cookie });
      const body = await expectJson(res, 200);
      expect(body.resolvedAmountCents).toBe(CLASS_MEMBER_CENTS);
      expect(body.resolvedAmountCents).not.toBe(CARD_MEMBER_CENTS);
      expect(body.resolvedPaymentMethod).toBe("card_online");
    } finally {
      await db.delete(memberships).where(eq(memberships.id, membershipId));
      await db.delete(familyMembers).where(eq(familyMembers.id, child.id));
    }
  });
});
