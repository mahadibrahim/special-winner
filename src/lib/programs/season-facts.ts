import type { ApiSeason } from "./api-season"
import { isDualMode, isIndividualOnly, isTeamOnly } from "./derive"
import { byRegistrationCloses, scopeSeasons, type CategoryAudience } from "./category-pages"
import { parseDateOnly } from "@/lib/time/format-date"

/**
 * Pure helpers behind the "Season at a glance" facts band on the category
 * landing pages (/adult/leagues, /youth/leagues). Everything operates on the
 * OPEN (registerable-now) slice of the catalog — forming seasons collect
 * interest but their prices/dates are not commitments, so they never feed a
 * headline fact.
 *
 * Early-bird guards mirror program-card-v2 / src/lib/programs/early-bird.ts:
 * a discount only counts while the deadline is in the future AND the
 * discounted figure actually undercuts the list price (an "early-bird" at or
 * above list is a misconfiguration and must not render).
 */

/** Open seasons scoped to a category page's audience + program types. */
export function openScopedSeasons(
  seasons: ApiSeason[],
  audience: CategoryAudience,
  programTypes: string[],
): ApiSeason[] {
  return scopeSeasons(seasons, audience, programTypes).filter((s) => s.status === "open")
}

function ebInFuture(s: ApiSeason, now: Date): boolean {
  return s.earlyBirdDeadline != null && new Date(s.earlyBirdDeadline).getTime() > now.getTime()
}

/** Effective per-player price (early-bird aware). Null when solo signup isn't offered. */
export function effectiveIndividualPrice(s: ApiSeason, now: Date = new Date()): number | null {
  if (!(isIndividualOnly(s) || isDualMode(s))) return null
  if (s.price == null || s.price <= 0) return null
  if (
    ebInFuture(s, now) &&
    s.earlyBirdPrice != null &&
    s.earlyBirdPrice > 0 &&
    s.earlyBirdPrice < s.price
  ) {
    return s.earlyBirdPrice
  }
  return s.price
}

/** Cheapest way in as an individual across the open set ("$120 / player"). */
export function minIndividualPrice(seasons: ApiSeason[], now: Date = new Date()): number | null {
  const prices = seasons
    .map((s) => effectiveIndividualPrice(s, now))
    .filter((p): p is number => p != null)
  return prices.length > 0 ? Math.min(...prices) : null
}

/** Effective full team fee (early-bird aware). Null when team signup isn't offered. */
export function effectiveTeamTotal(s: ApiSeason, now: Date = new Date()): number | null {
  if (!(isTeamOnly(s) || isDualMode(s))) return null
  if (s.teamPrice == null || s.teamPrice <= 0) return null
  if (
    ebInFuture(s, now) &&
    s.earlyBirdTeamPrice != null &&
    s.earlyBirdTeamPrice > 0 &&
    s.earlyBirdTeamPrice < s.teamPrice
  ) {
    return s.earlyBirdTeamPrice
  }
  return s.teamPrice
}

/** Cheapest full team fee across the open set ("$1,000 total"). */
export function minTeamTotal(seasons: ApiSeason[], now: Date = new Date()): number | null {
  const prices = seasons
    .map((s) => effectiveTeamTotal(s, now))
    .filter((p): p is number => p != null)
  return prices.length > 0 ? Math.min(...prices) : null
}

/** Earliest registration deadline across the open set, as a Date. */
export function earliestRegistrationCloses(seasons: ApiSeason[]): Date | null {
  let best: number | null = null
  for (const s of seasons) {
    if (!s.registrationCloses) continue
    const t = Date.parse(s.registrationCloses)
    if (Number.isNaN(t)) continue
    if (best == null || t < best) best = t
  }
  return best != null ? new Date(best) : null
}

/** Earliest season start across the open set (date-only string, "YYYY-MM-DD"). */
export function earliestStartDate(seasons: ApiSeason[]): string | null {
  let best: string | null = null
  let bestT = Number.POSITIVE_INFINITY
  for (const s of seasons) {
    if (!s.startDate) continue
    const t = parseDateOnly(s.startDate).getTime()
    if (Number.isNaN(t)) continue
    if (t < bestT) {
      bestT = t
      best = s.startDate
    }
  }
  return best
}

/**
 * Smallest VALID hold-a-spot deposit across the open set ("$50 holds a
 * spot"). Valid = allowDeposit on, a real partial amount (0 < deposit <
 * per-player price). Null when no season offers one — callers omit the fact.
 */
export function minHoldDeposit(seasons: ApiSeason[]): number | null {
  let best: number | null = null
  for (const s of seasons) {
    if (s.allowDeposit !== true || s.deposit == null || s.deposit <= 0) continue
    if (s.price == null || s.deposit >= s.price) continue
    if (best == null || s.deposit < best) best = s.deposit
  }
  return best
}

/**
 * Term label ("Fall 2026" / "Winter I") for a facts line, taken from the most
 * urgent (soonest-closing) season that carries one. Seasons without a
 * `termLabel` fall back to a generic "Season YYYY" name when that's all the
 * set has. Null when no season carries either — callers omit the fact.
 */
export function primaryTermLabel(seasons: ApiSeason[]): string | null {
  const sorted = [...seasons].sort(byRegistrationCloses)
  for (const s of sorted) {
    const label = s.termLabel?.trim()
    if (label) return label
  }
  for (const s of sorted) {
    const name = s.name?.trim() ?? ""
    if (/^(Spring|Summer|Fall|Winter)\s+\d{4}$/i.test(name)) return name
  }
  return null
}

/**
 * Combined age range across the set ("ages 4–12"). Per-season bounds prefer
 * the age group; a season's own minAge/maxAge is the fallback. Null when no
 * season carries any age data — callers omit the fact rather than inventing
 * a range.
 */
export function ageRangeAcross(seasons: ApiSeason[]): { min: number; max: number } | null {
  let min: number | null = null
  let max: number | null = null
  for (const s of seasons) {
    const lo = s.ageGroup?.minAge ?? s.minAge
    const hi = s.ageGroup?.maxAge ?? s.maxAge
    if (lo != null && (min == null || lo < min)) min = lo
    if (hi != null && (max == null || hi > max)) max = hi
  }
  if (min == null && max == null) return null
  return { min: min ?? (max as number), max: max ?? (min as number) }
}

/** Most common venue name across the set (the page's "home venue"). */
export function primaryVenueName(seasons: ApiSeason[]): string | null {
  const counts = new Map<string, number>()
  for (const s of seasons) {
    const name = s.location?.name?.trim()
    if (!name) continue
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  let best: string | null = null
  let bestN = 0
  for (const [name, n] of counts) {
    if (n > bestN) {
      best = name
      bestN = n
    }
  }
  return best
}
