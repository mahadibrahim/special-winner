// Shared discount-code validation + pricing. Used by the public
// validate-discount endpoint (solo checkout) and the team reserve step's
// apply-discount endpoint, so both enforce the same rules.
import { and, eq, sql } from "drizzle-orm";
import { discountCodes, discountUsages, type DiscountCode } from "@/lib/db/schema";
import type { getDb } from "@/lib/db";

type Db = ReturnType<typeof getDb>;

export type DiscountEligibility =
  | { ok: true; code: DiscountCode }
  | { ok: false; error: string };

/**
 * Check a code against every rule except the final amount math: existence,
 * org scope, active flag, date window, total + per-user usage caps, season
 * restriction, and minimum purchase. Mirrors the checks in
 * /api/public/validate-discount so behavior can't drift between surfaces.
 */
export async function checkDiscountEligibility(
  db: Db,
  params: {
    code: string;
    organizationId: string;
    seasonId?: string | null;
    purchaseAmountCents?: number;
    userId?: string | null;
  },
): Promise<DiscountEligibility> {
  const normalized = params.code.trim().toUpperCase();

  const [code] = await db
    .select()
    .from(discountCodes)
    .where(and(eq(discountCodes.code, normalized), eq(discountCodes.organizationId, params.organizationId)));

  if (!code) return { ok: false, error: "Invalid discount code" };
  if (!code.active) return { ok: false, error: "This discount code is no longer active" };

  const now = new Date();
  if (code.startsAt && now < code.startsAt) return { ok: false, error: "This discount code is not yet active" };
  if (code.expiresAt && now > code.expiresAt) return { ok: false, error: "This discount code has expired" };

  if (code.maxUses && code.usedCount >= code.maxUses) {
    return { ok: false, error: "This discount code has reached its usage limit" };
  }

  if (code.seasonId && params.seasonId && code.seasonId !== params.seasonId) {
    return { ok: false, error: "This discount code is not valid for this season" };
  }

  if (
    code.minPurchaseCents &&
    params.purchaseAmountCents !== undefined &&
    params.purchaseAmountCents < code.minPurchaseCents
  ) {
    const min = (code.minPurchaseCents / 100).toFixed(2);
    return { ok: false, error: `Minimum purchase of $${min} required for this discount` };
  }

  if (params.userId && code.maxUsesPerUser) {
    const [usage] = await db
      .select({ count: sql<number>`count(*)` })
      .from(discountUsages)
      .where(and(eq(discountUsages.discountCodeId, code.id), eq(discountUsages.userId, params.userId)));
    if (Number(usage?.count ?? 0) >= code.maxUsesPerUser) {
      return { ok: false, error: "You have already used this discount code the maximum number of times" };
    }
  }

  return { ok: true, code };
}

/**
 * The discount in cents for a given purchase amount. Percentage codes store
 * `discountValue` as percentage × 100 (1500 = 15%) and honor maxDiscountCents;
 * fixed codes are capped at the purchase amount so a discount never exceeds it.
 */
export function computeDiscountCents(code: DiscountCode, purchaseAmountCents: number): number {
  if (code.discountType === "percentage") {
    let amount = Math.round((purchaseAmountCents * code.discountValue) / 10000);
    if (code.maxDiscountCents && amount > code.maxDiscountCents) amount = code.maxDiscountCents;
    return amount;
  }
  return Math.min(code.discountValue, purchaseAmountCents);
}
