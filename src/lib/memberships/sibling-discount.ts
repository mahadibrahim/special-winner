/**
 * Sibling discount: an additional child's MONTHLY PACKAGE gets a
 * percent-off, decided at subscribe time and kept for the life of the
 * subscription (no re-ranking when the full-price sibling cancels — spec'd).
 * Rate comes from org settings `siblingDiscountPct`, default 10.
 *
 * Implemented as a fixed `amount_off` coupon, NOT `percent_off` — Stripe
 * discount coupons on a subscription apply to the invoice total, so a
 * percent coupon would also shave the (undiscounted-by-spec) annual fee
 * line item on every invoice that carries one:
 *   - first invoice (monthly + fee):      total − amount_off = discounted
 *                                          monthly + FULL fee
 *   - renewal invoices (monthly only):    monthly − amount_off
 *   - anniversary invoices (monthly + fee item): full fee preserved
 * A percent coupon can't express "monthly line only" — Stripe discounts
 * the whole invoice — so the fixed cents amount (computed off the tier's
 * monthly price) is the only way to keep the fee un-discounted on every
 * invoice shape.
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

/**
 * Returns a reusable Stripe coupon id when the discount applies, else null.
 *
 * `monthlyPriceCents` is the subscribing child's tier's monthly price — the
 * base the fixed discount amount is computed off of. Null (no monthly
 * price configured on the tier) means there's nothing to discount, so this
 * returns null without touching Stripe.
 */
export async function getSiblingCouponId(
  orgId: string,
  userId: string,
  familyMemberId: string,
  monthlyPriceCents: number | null,
): Promise<string | null> {
  if (monthlyPriceCents == null) return null;

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

  // Fixed amount_off, computed off THIS tier's monthly price — see the
  // module doc comment for why percent_off is wrong here. Reusable
  // forever-duration coupon, one per (pct, amount) pair so tiers sharing a
  // monthly price share a coupon. Custom coupon ids make create
  // idempotent: on resource_already_exists we reuse it.
  const amountOffCents = Math.round((monthlyPriceCents * pct) / 100);
  if (amountOffCents <= 0) return null;
  const couponId = `sibling-${pct}pct-${amountOffCents}c`;
  const s = membershipsStripe();
  try {
    await s.coupons.create({
      id: couponId,
      amount_off: amountOffCents,
      currency: "usd",
      duration: "forever",
      name: `Sibling discount ${pct}%`,
    });
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code !== "resource_already_exists") throw err;
  }
  return couponId;
}
