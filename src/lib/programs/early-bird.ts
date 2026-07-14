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
  /**
   * The per-player list price. Optional so deadline-only callers still work,
   * but pass it wherever you have it — it's what makes the "not a discount"
   * guard below fire.
   */
  priceCents?: number | null;
}

export function isEarlyBirdActive(
  season: SeasonEarlyBird,
  now: Date = new Date(),
): boolean {
  // Non-positive price is treated as unset — a 0 here would otherwise make
  // every early-bird registration free.
  if (
    !season.earlyBirdDeadline ||
    season.earlyBirdPriceCents == null ||
    season.earlyBirdPriceCents <= 0
  ) {
    return false;
  }
  // An early-bird price at or above the list price is not a discount — it is a
  // misconfiguration, and honoring it OVERCHARGES the customer. This is not
  // hypothetical: the Fall 2026 seasons carried a team early-bird price
  // ($1,000) in this per-player field alongside a $120 individual price, which
  // billed solo registrants 8.3x. `early_bird_price_cents` is per-player only;
  // the team path bills `team_price_cents` flat and never consults early-bird.
  // Fall back to the list price rather than charging more than list.
  if (
    season.priceCents != null &&
    season.earlyBirdPriceCents >= season.priceCents
  ) {
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

// ---------------------------------------------------------------------------
// Team early-bird — the twin of the above, on the team price.
//
// Kept as separate functions rather than a mode flag because the two prices are
// independent: a season may run an early-bird for teams, for individuals, for
// both, or for neither. Aspire's leagues are team-early-bird only by policy —
// solo players pay flat list price on purpose.
// ---------------------------------------------------------------------------

export interface SeasonTeamEarlyBird {
  earlyBirdDeadline: Date | string | null;
  earlyBirdTeamPriceCents: number | null;
  /** The list team price. Optional, but pass it — it arms the discount guard. */
  teamPriceCents?: number | null;
}

export function isTeamEarlyBirdActive(
  season: SeasonTeamEarlyBird,
  now: Date = new Date(),
): boolean {
  if (
    !season.earlyBirdDeadline ||
    season.earlyBirdTeamPriceCents == null ||
    season.earlyBirdTeamPriceCents <= 0
  ) {
    return false;
  }
  // Same invariant as the per-player side: an "early-bird" at or above the list
  // price is a misconfiguration, and honoring it would overcharge. Fall back to
  // the list price instead of charging more.
  if (
    season.teamPriceCents != null &&
    season.earlyBirdTeamPriceCents >= season.teamPriceCents
  ) {
    return false;
  }
  return now.getTime() < new Date(season.earlyBirdDeadline).getTime();
}

/**
 * The team fee chargeable right now: the early-bird team price while the window
 * is active, the list team price otherwise. `teamPriceCents` is nullable in the
 * schema (team signup not offered), so callers pass the resolved fallback they
 * already use — today that is `teamPriceCents ?? priceCents`.
 */
export function effectiveTeamPriceCents(
  season: SeasonTeamEarlyBird,
  listTeamPriceCents: number,
  now: Date = new Date(),
): number {
  return isTeamEarlyBirdActive(
    { ...season, teamPriceCents: season.teamPriceCents ?? listTeamPriceCents },
    now,
  )
    ? (season.earlyBirdTeamPriceCents as number)
    : listTeamPriceCents;
}
