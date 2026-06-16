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

/**
 * The newsletter `source` value for the /join landing page. Distinct from
 * CAPTURE_INCENTIVE_SOURCE so analytics can separate flyer-driven signups
 * from home-page-band signups, while both deliver the same incentive code.
 */
export const JOIN_PAGE_SOURCE = "join-page";

/** Sources whose signups should receive the discount-code incentive email. */
const INCENTIVE_SOURCES: ReadonlySet<string> = new Set([
  CAPTURE_INCENTIVE_SOURCE,
  JOIN_PAGE_SOURCE,
]);

/** True if a signup `source` should trigger the incentive-code email. */
export function sourceTriggersIncentive(
  source: string | null | undefined,
): boolean {
  return source != null && INCENTIVE_SOURCES.has(source);
}
