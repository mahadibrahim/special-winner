/**
 * Pure pricing helpers for field rentals. No DB access — unit-tested.
 * Mirrors the drop-in "session override wins over rate-card default"
 * pattern (`src/lib/dropin/pricing.ts`).
 */

/** Venue per-venue override wins; otherwise the org rate-card default. */
export function resolveRentalHourlyRateCents(
  venueHourlyRateCents: number | null,
  rateCardDefaultHourlyRateCents: number,
): number {
  return venueHourlyRateCents ?? rateCardDefaultHourlyRateCents;
}

/** Price = (duration in hours) * hourly rate, rounded to the nearest cent. */
export function computeRentalPriceCents(
  startsAt: Date,
  endsAt: Date,
  hourlyRateCents: number,
): number {
  const ms = endsAt.getTime() - startsAt.getTime();
  if (ms <= 0) return 0;
  const hours = ms / (1000 * 60 * 60);
  return Math.round(hours * hourlyRateCents);
}
