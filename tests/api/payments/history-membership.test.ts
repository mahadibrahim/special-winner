import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { payments } from "@/lib/db/schema/payments";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { apiFetch, getAuthCookie } from "../setup/test-helpers";
import { createTestUserWithPassword } from "../../utils/host-helpers";
import {
  createTestChild,
  createTestChildMembership,
  cleanupTestMembershipTiers,
} from "../../utils/classes-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";

/**
 * F1 (final-review wave, classes-dashboard-launch): `GET /api/payments/
 * history` used to INNER JOIN `seasons` via
 * `COALESCE(registrations.seasonId, teamRegistrations.seasonId)`, which is
 * NULL for a class-membership subscription charge (a `payments` row with
 * `paymentType: "membership"` and no registration at all — see
 * src/lib/memberships/invoice-ledger.ts's `handleInvoicePaid`). That silently
 * dropped every membership charge from both `/dashboard/payments` and the
 * family-page "Payments" summary card.
 *
 * Minted directly via DB insert (no Stripe/webhook needed in CI — same
 * shorthand `createTestChildMembership` already uses for the membership row
 * itself; see CI-api-tests-have-no-stripe precedent).
 */
describe("GET /api/payments/history — membership charges (F1)", () => {
  let organizationId: string;
  let tierId: string;
  let membershipId: string;
  let paymentId: string;
  let cookie: string;
  let parentUserId: string;
  let childId: string;

  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const tierName = `History Membership Tier - ${suffix}`;

  beforeAll(async () => {
    ({ organizationId } = await resolveDefaultOrgForHttpTests());
    const db = getDb();

    const throwawayUser = await createTestUserWithPassword();
    parentUserId = throwawayUser.userId;
    cookie = await getAuthCookie(throwawayUser.email, throwawayUser.password);

    childId = await createTestChild(parentUserId, `HistoryMembershipE2E-${suffix}`);

    const [tier] = await db
      .insert(membershipTiers)
      .values({
        organizationId,
        name: tierName,
        monthlyPriceCents: 4900,
        benefits: { classes_per_month: 4 },
        isActive: true,
      })
      .returning();
    tierId = tier.id;

    membershipId = await createTestChildMembership({
      userId: parentUserId,
      familyMemberId: childId,
      organizationId,
      tierId,
      idSuffix: `history-${suffix}`,
    });

    const [payment] = await db
      .insert(payments)
      .values({
        membershipId,
        userId: parentUserId,
        amountCents: 4900,
        paymentType: "membership",
        status: "succeeded",
        stripePaymentIntentId: `pi_test_history_membership_${suffix}`,
      })
      .returning();
    paymentId = payment.id;
  });

  afterAll(async () => {
    const db = getDb();
    if (paymentId) await db.delete(payments).where(eq(payments.id, paymentId));
    if (membershipId) await db.delete(memberships).where(eq(memberships.id, membershipId));
    if (tierId) await cleanupTestMembershipTiers([tierId]);
  });

  it("surfaces the membership charge with a null season and an honest tier description", async () => {
    const res = await apiFetch("/api/payments/history", { cookie });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { payments: Array<Record<string, unknown>> };

    const row = body.payments.find((p) => p.id === paymentId);
    expect(row).toBeTruthy();
    expect(row?.season).toBeNull();
    expect(row?.program).toBeNull();
    expect(row?.sport).toBeNull();
    expect(row?.membership).toEqual({ tierName });
    expect(row?.familyMember).toEqual({
      firstName: `HistoryMembershipE2E-${suffix}`,
      lastName: "Test",
    });
    expect(row?.amountCents).toBe(4900);
    expect(row?.paymentType).toBe("membership");
  });
});
