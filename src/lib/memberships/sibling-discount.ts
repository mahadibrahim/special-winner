/**
 * Sibling discount: an additional child's monthly package gets a percent-off
 * Stripe coupon, decided at subscribe time and kept for the life of the
 * subscription (no re-ranking when the full-price sibling cancels — spec'd).
 * Rate comes from org settings `siblingDiscountPct`, default 10.
 */
import { and, eq, inArray, isNotNull, ne } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";
import { organizations } from "@/lib/db/schema/organizations";
import { membershipsStripe } from "./stripe";

const LIVE = ["active", "paused", "past_due", "incomplete"] as const;
export const DEFAULT_SIBLING_DISCOUNT_PCT = 10;

export function isSiblingEligible(
  existing: Array<{ familyMemberId: string | null; status: string }>,
  familyMemberId: string,
): boolean {
  return existing.some(
    (m) =>
      m.familyMemberId != null &&
      m.familyMemberId !== familyMemberId &&
      (LIVE as readonly string[]).includes(m.status),
  );
}

/** Returns a reusable Stripe coupon id when the discount applies, else null. */
export async function getSiblingCouponId(
  orgId: string,
  userId: string,
  familyMemberId: string,
): Promise<string | null> {
  const db = getDb();
  const existing = await db
    .select({
      familyMemberId: memberships.familyMemberId,
      status: memberships.status,
    })
    .from(memberships)
    .where(
      and(
        eq(memberships.userId, userId),
        eq(memberships.organizationId, orgId),
        isNotNull(memberships.familyMemberId),
        ne(memberships.familyMemberId, familyMemberId),
        inArray(memberships.status, [...LIVE]),
      ),
    );
  if (!isSiblingEligible(existing, familyMemberId)) return null;

  const [org] = await db
    .select({ settings: organizations.settings })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  const pct =
    (org?.settings as { siblingDiscountPct?: number } | null)
      ?.siblingDiscountPct ?? DEFAULT_SIBLING_DISCOUNT_PCT;
  if (pct <= 0) return null;

  // Reusable forever-duration coupon, one per percent. Custom coupon ids
  // make create idempotent: on resource_already_exists we reuse it.
  const couponId = `sibling-${pct}pct`;
  const s = membershipsStripe();
  try {
    await s.coupons.create({
      id: couponId,
      percent_off: pct,
      duration: "forever",
      name: `Sibling discount ${pct}%`,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "resource_already_exists") throw err;
  }
  return couponId;
}
