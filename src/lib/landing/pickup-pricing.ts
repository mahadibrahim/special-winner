// src/lib/landing/pickup-pricing.ts
export interface PricingTier {
  amountLabel: string   // "$17"
  label: string         // "Walk-in"
  best?: boolean
  note?: string         // "Save $5 →"
}

export interface RateCardCents {
  defaultSessionRateCents: number
  defaultMemberRateCents: number
}

/**
 * Walk-in price is display copy until the walk-in pricing enforcement spec
 * lands and adds a real per-org rate. See
 * docs/superpowers/specs/2026-06-18-adult-youth-sitemap-redesign-design.md
 * (Out of scope / follow-ups).
 */
export const WALK_IN_RATE_CENTS = 1700

function dollars(cents: number): string {
  return `$${Math.round(cents / 100)}`
}

export function pricingTiers(
  rate: RateCardCents,
  walkInCents: number = WALK_IN_RATE_CENTS,
): PricingTier[] {
  const save = walkInCents - rate.defaultMemberRateCents
  return [
    { amountLabel: dollars(walkInCents), label: "Walk-in" },
    { amountLabel: dollars(rate.defaultSessionRateCents), label: "Book online" },
    {
      amountLabel: dollars(rate.defaultMemberRateCents),
      label: "Member",
      best: true,
      note: save > 0 ? `Save ${dollars(save)} →` : undefined,
    },
  ]
}
