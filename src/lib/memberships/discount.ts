/**
 * Apply a member rental discount.
 *
 * Pure function — callers pass a base amount and the tier's `benefits`
 * JSONB blob. The discount key is optional; missing/zero/negative pct
 * passes the amount through unchanged. Values above 100 clamp to 100.
 *
 * Rounding uses `Math.round` to land on whole cents — consistent with
 * the rounding the rentals/drop-in flows already do for application fees
 * (see `Math.round((amountDueCents * applicationFeePct) / 100)`).
 */

export interface MemberBenefits {
  rental_discount_pct?: number;
  priority_league_signup_hrs?: number;
  guest_passes_per_month?: number;
  booking_window_days?: number;
  members_only_pickup?: boolean;
  unlimited_pickup?: boolean;
  free_pickup_per_month?: number;
  [key: string]: unknown;
}

export function applyMemberRentalDiscount(
  baseAmountCents: number,
  benefits: MemberBenefits,
): number {
  const rawPct = benefits.rental_discount_pct ?? 0;
  if (rawPct <= 0) return baseAmountCents;
  const pct = Math.min(rawPct, 100);
  const discounted = baseAmountCents * (1 - pct / 100);
  return Math.max(0, Math.round(discounted));
}
