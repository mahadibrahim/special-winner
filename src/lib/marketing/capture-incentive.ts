/**
 * Email-capture incentive campaign (aesthetic-evolution slice 7).
 * Founder decisions 2026-06-12: $15 off, ONE shared code, capture band
 * stays home-only.
 *
 * This module is the single source of truth for the campaign — the capture
 * band copy and the incentive email both read from it. Rotating the campaign
 * means: update this constant AND create the matching discount_codes row via
 * /admin/discount-codes (fixed amount, per-user limit 1). The code printed in
 * the email is only valid at checkout if that row exists and is active.
 */
export const CAPTURE_INCENTIVE = {
  code: "WELCOME15",
  amountCents: 1500,
} as const;

/**
 * The newsletter `source` value that routes a signup into the incentive
 * email path. The capture band posts it; /api/public/newsletter gates on it.
 */
export const CAPTURE_INCENTIVE_SOURCE = "home-incentive";

/** "$15" for whole dollars, "$12.50" otherwise. */
export function formatIncentiveAmount(cents: number): string {
  return cents % 100 === 0
    ? `$${cents / 100}`
    : `$${(cents / 100).toFixed(2)}`;
}
