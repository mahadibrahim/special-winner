/**
 * Early-bird pricing semantics for seasons (2026-07-04).
 *
 * A season offers an early-bird price only when BOTH `early_bird_deadline`
 * and `early_bird_price_cents` are set, and only strictly before the
 * deadline instant. Deposits are never early-bird discounted — only the
 * full-price component switches; `deposit_cents` is charged as-is.
 *
 * Pure functions; charge-side enforcement lives in
 * src/lib/registrations/create-registration.ts and the display twin in
 * src/pages/api/public/seasons/[id].ts. Keep the consumers in sync.
 */

export interface SeasonEarlyBird {
  /** timestamp column — Date from drizzle, string once serialized */
  earlyBirdDeadline: Date | string | null;
  earlyBirdPriceCents: number | null;
}

export function isEarlyBirdActive(
  season: SeasonEarlyBird,
  now: Date = new Date(),
): boolean {
  if (!season.earlyBirdDeadline || season.earlyBirdPriceCents == null) {
    return false;
  }
  return now.getTime() < new Date(season.earlyBirdDeadline).getTime();
}

/**
 * The full-price component chargeable right now: the early-bird price while
 * the window is active, the list price otherwise.
 */
export function effectivePriceCents(
  season: SeasonEarlyBird & { priceCents: number },
  now: Date = new Date(),
): number {
  return isEarlyBirdActive(season, now)
    ? (season.earlyBirdPriceCents as number)
    : season.priceCents;
}
