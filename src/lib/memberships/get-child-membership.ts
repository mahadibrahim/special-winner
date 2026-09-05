/**
 * Child-membership lookup: resolves the active membership FOR A CHILD
 * (family_members row), not for the paying user. Used by the camp
 * discount (Plan 1) and class booking/auto-booking (Plan 2).
 *
 * Mirrors get-active-membership.ts's tier-join safety gate: zero rows
 * when the org has no tiers or the child has no live membership.
 *
 * `classAllotmentRemaining` reflects the `classes_per_month` /
 * `unlimited_classes` benefits: for a tier with a class benefit it counts
 * the child's confirmed/no_show `member_allotment` class bookings this
 * calendar month and derives `cap − used` (or "unlimited"). Tiers without
 * a class benefit short-circuit to 0 with no extra query — mirrors the
 * pickup allotment short-circuit in get-active-membership.ts.
 */
import { and, count, eq, gte, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships, membershipTiers } from "@/lib/db/schema/memberships";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { computeClassAllotmentRemaining, allotmentPeriodStart } from "./allotment";

type DbClient =
  | ReturnType<typeof getDb>
  | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

const LIVE_STATUSES = ["active", "paused", "past_due", "incomplete"] as const;

export interface ChildMembership {
  id: string;
  userId: string;
  tierId: string;
  tierName: string;
  status: (typeof LIVE_STATUSES)[number];
  benefits: Record<string, unknown>;
  classAllotmentRemaining: number | "unlimited";
  /** Monthly technical-training supplement configured on the tier — null/0
   *  means the tier has no premium configured. Used by requiresTechnicalPremium
   *  (src/lib/classes/technical-premium.ts). */
  technicalMonthlyCents: number | null;
  /** The membership's live Stripe subscription id — null for a membership
   *  that predates Stripe wiring or was seeded directly (tests). Used by
   *  syncTechnicalAddonQuantity to find the subscription to adjust. */
  stripeSubscriptionId: string | null;
  /** Stripe current_period_end — the "renews on" date. Null for DB-minted /
   *  pre-Stripe memberships. */
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
}

export async function getActiveChildMembership(
  familyMemberId: string,
  organizationId: string,
  dbOrTx?: DbClient,
): Promise<ChildMembership | null> {
  const db = dbOrTx ?? getDb();
  const rows = await db
    .select({ m: memberships, t: membershipTiers })
    .from(memberships)
    .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
    .where(
      and(
        eq(memberships.familyMemberId, familyMemberId),
        eq(memberships.organizationId, organizationId),
        eq(membershipTiers.organizationId, organizationId),
        inArray(memberships.status, [...LIVE_STATUSES]),
      ),
    )
    .orderBy(desc(memberships.createdAt))
    .limit(1);
  const row = rows[0];
  if (!row) return null;

  const benefits: Record<string, unknown> =
    typeof row.t.benefits === "object" && row.t.benefits !== null
      ? (row.t.benefits as Record<string, unknown>)
      : {};

  // Class allotment: unlimited/no-benefit tiers skip the count query
  // entirely (mirrors the pickup short-circuit in get-active-membership.ts).
  let classAllotmentRemaining: number | "unlimited" = 0;
  const hasClassBenefit =
    benefits.unlimited_classes === true || (Number(benefits.classes_per_month) || 0) > 0;
  if (hasClassBenefit) {
    const [usedRow] = await db
      .select({ used: count() })
      .from(dropInBookings)
      .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
      .where(
        and(
          eq(dropInBookings.membershipId, row.m.id),
          eq(dropInBookings.familyMemberId, familyMemberId),
          eq(dropInSessions.kind, "class"),
          eq(dropInBookings.paymentMethod, "member_allotment"),
          inArray(dropInBookings.status, ["confirmed", "no_show"]),
          gte(dropInBookings.createdAt, allotmentPeriodStart(new Date())),
        ),
      );
    classAllotmentRemaining = computeClassAllotmentRemaining(benefits, usedRow?.used ?? 0);
  }

  return {
    id: row.m.id,
    userId: row.m.userId,
    tierId: row.t.id,
    tierName: row.t.name,
    status: row.m.status as ChildMembership["status"],
    benefits,
    classAllotmentRemaining,
    technicalMonthlyCents: row.t.technicalMonthlyCents,
    stripeSubscriptionId: row.m.stripeSubscriptionId,
    currentPeriodEnd: row.m.currentPeriodEnd,
    cancelAtPeriodEnd: row.m.cancelAtPeriodEnd,
  };
}
