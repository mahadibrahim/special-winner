// src/lib/rentals/soccerone-pricing.ts
// SoccerOne field-rental pricing: seasonal × time-of-day tiers, summed per hour.
// Pure (no DB). Rates are typed config (admin-editable rates are a follow-up).
// See docs/superpowers/specs/2026-06-19-soccerone-rental-revamp-design.md.

export type RentalSeason = "summer" | "winter" // summer = Apr–Sep, winter = Oct–Mar
type RentalTier = "before3" | "midday" | "evening" // weekday tiers; weekend is always "evening"

/** Per-hour rates in cents. */
const SCHEDULE: Record<RentalSeason, Record<RentalTier, number>> = {
  summer: { before3: 11000, midday: 17000, evening: 19000 },
  winter: { before3: 13000, midday: 18500, evening: 26000 },
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }

interface LocalParts { month: number; weekday: number; hour: number }

/** Wall-clock parts of `date` in the given IANA timezone. */
function localParts(date: Date, timeZone: string): LocalParts {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone, month: "numeric", weekday: "short", hour: "numeric", hour12: false,
  }).formatToParts(date)
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? ""
  let hour = parseInt(get("hour"), 10)
  if (hour === 24) hour = 0 // hour12:false can render midnight as "24"
  return { month: parseInt(get("month"), 10), weekday: WEEKDAY[get("weekday")], hour }
}

export function resolveSeason(month: number): RentalSeason {
  return month >= 4 && month <= 9 ? "summer" : "winter"
}

/** Rate (cents) for the one-hour block starting at `hourStart`, resolved in `timeZone`. */
export function resolveHourRateCents(hourStart: Date, timeZone: string): number {
  const { month, weekday, hour } = localParts(hourStart, timeZone)
  const season = resolveSeason(month)
  const isWeekend = weekday === 0 || weekday === 6
  const tier: RentalTier = isWeekend ? "evening" : hour < 15 ? "before3" : hour < 18 ? "midday" : "evening"
  return SCHEDULE[season][tier]
}

/** Total (cents) for [startsAt, endsAt), summed per whole hour. Bookings are whole-hour. */
export function quoteRentalCents(startsAt: Date, endsAt: Date, timeZone: string): number {
  const ms = endsAt.getTime() - startsAt.getTime()
  if (ms <= 0) return 0
  const hours = Math.round(ms / 3_600_000)
  let total = 0
  for (let i = 0; i < hours; i++) {
    total += resolveHourRateCents(new Date(startsAt.getTime() + i * 3_600_000), timeZone)
  }
  return total
}

/** The schedule, exposed for the rates-table display so UI can't drift from pricing. */
export const RENTAL_RATE_SCHEDULE = SCHEDULE
