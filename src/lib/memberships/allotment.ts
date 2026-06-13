/**
 * Drop-in membership allotment (the `free_pickup_per_month` benefit).
 *
 * A tier with `free_pickup_per_month: N` grants N free drop-in pickups per
 * calendar month. Usage is COUNT-based, not a stored counter: each confirmed
 * `member_allotment` booking is itself one unit of consumption, so
 * `allotmentRemaining = cap − (member_allotment bookings claimed this period)`.
 * That keeps the feature migration-free and self-consistent — the booking
 * insert is the decrement, and a cancellation (which leaves the cancelled
 * status) returns the slot automatically.
 *
 * Period boundary is the calendar month in UTC, so the allotment resets on the
 * 1st regardless of billing interval (a tier can sell "N/month" on an annual
 * subscription). See `allotmentPeriodStart`.
 *
 * Known limitation (acceptable for v2 launch): the count is read just before
 * the booking insert, and the free-path transaction locks the *session* row,
 * not the membership. Two simultaneous bookings on *different* sessions by the
 * same member can therefore each see the same remaining count and both go
 * free — over-granting by at most the number of in-flight concurrent bookings.
 * The realistic blast radius is one or two extra free pickups; tighten with a
 * membership-row lock or a stored period counter if this ever matters.
 */

export interface AllotmentBenefits {
  unlimited_pickup?: boolean;
  free_pickup_per_month?: number;
}

/**
 * Free `member_allotment` drop-ins remaining this period.
 *
 * Returns 0 for unlimited tiers (resolveRate's unlimited branch fires first,
 * so they never draw from an allotment) and for tiers without the benefit.
 */
export function computeAllotmentRemaining(
  benefits: AllotmentBenefits | null | undefined,
  usedThisPeriod: number,
): number {
  if (!benefits || benefits.unlimited_pickup === true) return 0;
  const cap = Number(benefits.free_pickup_per_month) || 0;
  if (cap <= 0) return 0;
  const used = Math.max(0, Math.floor(usedThisPeriod) || 0);
  return Math.max(0, cap - used);
}

/** Start of the current calendar month in UTC — the allotment reset boundary. */
export function allotmentPeriodStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
