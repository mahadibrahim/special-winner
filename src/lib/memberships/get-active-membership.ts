/**
 * Active-membership lookup — the single hot-path safety surface for Phase 3.
 *
 * Returns the shape that drop-in `resolveRate` expects (`MembershipForPricing`
 * with `tier.benefits`, `allotmentRemaining`) PLUS the fields the rental
 * checkout and dashboard need (`status`, `currentPeriodEnd`). One function,
 * one DB query, used by every consumer.
 *
 * SAFETY: returns `null` cheaply when:
 *   - the org has no rows in `membership_tiers` (Aspire today), OR
 *   - the user has no active membership row for that org.
 *
 * The "no tier" gate is achieved by inner-joining `memberships` to
 * `membership_tiers` and filtering by `tier.organizationId`. The query
 * returns zero rows in both null-cases — no separate `orgHasMembershipTiers`
 * round-trip required.
 *
 * `allotmentRemaining` is always 0 in v1 (the allotment feature is v2 per
 * the data-model doc); the drop-in resolver's "Allotment tier with credits
 * remaining" branch is therefore never hit by v1 data.
 */
import { and, eq, inArray, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  memberships,
  membershipTiers,
} from "@/lib/db/schema/memberships";

// Drizzle's tx and the top-level db share a `.select().from(...)` surface,
// so a caller inside a `db.transaction(async (tx) => …)` block can pass `tx`
// here to reuse the transaction's connection. Without this, the inner
// lookup would acquire a fresh pool client and contend with the
// transaction's held connection — small pools then deadlock under load
// (e.g. the dropin free-path orchestrator, which holds a SELECT FOR UPDATE
// on `drop_in_sessions` while it resolves the booker's membership).
type DbClient = ReturnType<typeof getDb> | Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

export interface ActiveMembership {
  id: string;
  userId: string;
  organizationId: string;
  status: "active" | "paused" | "past_due" | "incomplete";
  billingInterval: "month" | "year";
  currentPeriodEnd: Date | null;
  pausedAt: Date | null;
  pauseResumesAt: Date | null;
  cancelAtPeriodEnd: boolean;
  stripeSubscriptionId: string | null;
  stripeCustomerId: string | null;
  tier: {
    id: string;
    name: string;
    monthlyPriceCents: number | null;
    annualPriceCents: number | null;
    benefits: {
      rental_discount_pct?: number;
      unlimited_pickup?: boolean;
      free_pickup_per_month?: number;
      [key: string]: unknown;
    };
  };
  allotmentRemaining: number;
}

const ACTIVE_STATUSES = ["active", "paused", "past_due", "incomplete"] as const;

export async function getActiveMembershipForOrg(
  userId: string,
  organizationId: string,
  /** Optional Drizzle tx (or db) — pass `tx` from within `db.transaction(...)` to reuse the connection. */
  dbOrTx?: DbClient,
): Promise<ActiveMembership | null> {
  const db = dbOrTx ?? getDb();
  const rows = await db
    .select({
      m: memberships,
      t: membershipTiers,
    })
    .from(memberships)
    .innerJoin(membershipTiers, eq(membershipTiers.id, memberships.tierId))
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, organizationId),
        eq(membershipTiers.organizationId, organizationId),
        inArray(memberships.status, [...ACTIVE_STATUSES]),
      ),
    )
    // The partial unique index guarantees at most one row matches, but
    // explicit ordering satisfies the multi-tenant query-hazard convention
    // from CLAUDE.md (never trust the planner to pick the same row twice).
    .orderBy(desc(memberships.createdAt))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  const benefits =
    typeof row.t.benefits === "object" && row.t.benefits !== null
      ? (row.t.benefits as Record<string, unknown>)
      : {};

  return {
    id: row.m.id,
    userId: row.m.userId,
    organizationId: row.m.organizationId,
    status: row.m.status as ActiveMembership["status"],
    billingInterval: row.m.billingInterval as ActiveMembership["billingInterval"],
    currentPeriodEnd: row.m.currentPeriodEnd,
    pausedAt: row.m.pausedAt,
    pauseResumesAt: row.m.pauseResumesAt,
    cancelAtPeriodEnd: row.m.cancelAtPeriodEnd,
    stripeSubscriptionId: row.m.stripeSubscriptionId,
    stripeCustomerId: row.m.stripeCustomerId,
    tier: {
      id: row.t.id,
      name: row.t.name,
      monthlyPriceCents: row.t.monthlyPriceCents,
      annualPriceCents: row.t.annualPriceCents,
      benefits,
    },
    allotmentRemaining: 0,
  };
}
