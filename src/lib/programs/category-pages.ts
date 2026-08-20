import { deriveAudience } from "@/lib/programs/derive"
import type { ApiSeason } from "@/lib/programs/api-season"

/**
 * Pure helpers behind the audience-scoped category pages
 * (/adult/leagues, /youth/camps, …). See
 * docs/superpowers/specs/2026-06-11-public-ia-redesign-design.md.
 */

export type CategoryAudience = "adult" | "youth"

export interface AgeBandChip {
  value: string
  label: string
  min: number
  max: number
}

/** Same bands as the /youth finder sections — kept as chips here because on
 *  category pages age is a filter, not a page axis. */
export const AGE_BAND_CHIPS: AgeBandChip[] = [
  { value: "4-8", label: "Ages 4–8", min: 4, max: 8 },
  { value: "9-12", label: "Ages 9–12", min: 9, max: 12 },
  { value: "13-18", label: "Ages 13–18", min: 13, max: 18 },
]

/** A season belongs to a band if its age range overlaps the band's range.
 *  A season with no age group applies to any age — never hidden. */
export function inAgeBand(s: ApiSeason, min: number, max: number): boolean {
  if (!s.ageGroup) return true
  return s.ageGroup.minAge <= max && s.ageGroup.maxAge >= min
}

/** Audience + program-type + optional sport scope for one category page.
 *
 *  `sportSlug` is optional and defaults to unscoped, because the category
 *  pages (/youth/leagues, /adult/leagues, /youth/camps …) deliberately span
 *  every sport. Only the per-sport pages pass it.
 *
 *  It exists because they previously could not: /youth/leagues/soccer rendered
 *  every youth league, so production showed futsal on a page titled Youth
 *  Soccer. An unknown sport returns nothing rather than falling back to
 *  everything — a silent fallback is what the original bug looked like. */
export function scopeSeasons(
  seasons: ApiSeason[],
  audience: CategoryAudience,
  programTypes: string[],
  sportSlug?: string | null,
  /** Restrict to specific programs, by slug — the camp-type pages pass their
   *  family's programs. Omitted or empty = no program filter (every existing
   *  page's behavior). Unknown slugs return nothing, never everything. */
  programSlugs?: string[],
): ApiSeason[] {
  return seasons.filter(
    (s) =>
      deriveAudience(s) === audience &&
      programTypes.includes(s.program.programType) &&
      (!sportSlug || s.sport?.slug === sportSlug) &&
      (!programSlugs || programSlugs.length === 0 || programSlugs.includes(s.program.slug)),
  )
}

/** Soonest registration deadline first; seasons without a deadline last,
 *  ties broken by start date. Keeps "about to close" inventory on top. */
export function byRegistrationCloses(a: ApiSeason, b: ApiSeason): number {
  const parseDeadline = (s: ApiSeason): number => {
    if (!s.registrationCloses) return Number.POSITIVE_INFINITY
    const t = Date.parse(s.registrationCloses)
    return Number.isNaN(t) ? Number.POSITIVE_INFINITY : t
  }
  const aT = parseDeadline(a)
  const bT = parseDeadline(b)
  if (aT !== bT) return aT - bT
  return Date.parse(a.startDate) - Date.parse(b.startDate)
}

/** Match a season against a U-group filter (e.g. "U10").
 *
 *  Compares against age_groups.name rather than deriving from minAge/maxAge:
 *  the 2026-27 Aug-Jul windows can't be expressed as integer age ranges.
 *  A season with no age group applies to any age — never hidden, mirroring
 *  inAgeBand above. */
export function matchesAgeGroup(s: ApiSeason, groupLabel: string | null): boolean {
  if (!groupLabel) return true
  if (!s.ageGroup) return true
  return s.ageGroup.name.toLowerCase() === groupLabel.toLowerCase()
}
