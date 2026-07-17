export interface FinderSeason {
  id: string
  divisionGender: string | null   // 'coed' | 'mens' | 'womens'
  dayOfWeek: string | null         // 'mon'..'sun'
  location: { slug: string; name: string }
  skillLevel: string | null        // 'a' | 'b' | 'c' | 'd' | 'open' | null
  /** The API nests audience under program: 'parents' = youth (parents
      register kids). Absent → adult. */
  program?: { audienceType?: string | null } | null
  // Presentational fields (name, status, price, etc.) ride along untyped on the
  // real payload; the finder only filters on the fields above.
  [extra: string]: unknown
}

// Each filter axis uses the string "all" (not null) as the no-filter sentinel
// because these values map directly to URL query params and chip values.
// Note: the sibling module division-filters.ts uses null — don't conflate the two.
export interface FinderFilters {
  location: string  // slug | "all"
  division: string  // divisionGender | "all"
  night: string     // dayOfWeek | "all"
  level: string     // skillLevel | "all"
  /** "adult" | "youth" | "all". Term pages fetch without an audience filter,
      so both audiences share one finder — this axis separates them. */
  ages?: string
}

export interface Chip { value: string; label: string }

const DIVISION_LABELS: Record<string, string> = {
  coed: "Coed", mens: "Men's", womens: "Women's",
}

export const NIGHT_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
}

export const LEVEL_LABELS: Record<string, string> = {
  a: "A", b: "B", c: "C", d: "D", open: "Open",
}

const WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]
const LEVEL_ORDER = ["a", "b", "c", "d", "open"]

export function deriveLocationChips(seasons: FinderSeason[]): Chip[] {
  const seen = new Map<string, string>()
  for (const s of seasons) {
    if (!seen.has(s.location.slug)) seen.set(s.location.slug, s.location.name)
  }
  return [...seen].map(([value, label]) => ({ value, label }))
}

export function deriveDivisionChips(seasons: FinderSeason[]): Chip[] {
  const seenSet = new Set<string>()
  const ordered: string[] = []
  for (const s of seasons) {
    if (s.divisionGender && !seenSet.has(s.divisionGender)) {
      seenSet.add(s.divisionGender)
      ordered.push(s.divisionGender)
    }
  }
  return ordered.map((value) => ({ value, label: DIVISION_LABELS[value] ?? value }))
}

export function deriveNightChips(seasons: FinderSeason[]): Chip[] {
  const present = new Set(seasons.map((s) => s.dayOfWeek).filter(Boolean) as string[])
  return WEEK_ORDER.filter((d) => present.has(d)).map((value) => ({ value, label: NIGHT_LABELS[value] }))
}

export function deriveLevelChips(seasons: FinderSeason[]): Chip[] {
  const present = new Set(seasons.map((s) => s.skillLevel).filter(Boolean) as string[])
  return LEVEL_ORDER.filter((l) => present.has(l)).map((value) => ({ value, label: LEVEL_LABELS[value] ?? value }))
}

/**
 * An `open` division accepts players of any level, so it must survive every
 * level filter — hiding it from a B player is wrong, and it hides the
 * divisions that are easiest to fill at the exact moment of intent.
 *
 * Mirrors the Aspire sibling `filterDivisions` in lib/leagues/division-filters.ts,
 * which has always done this deliberately. Keep the two in step: if this rule
 * changes, change it in both, or the same league behaves differently depending
 * on which brand's page you're standing on.
 *
 * A null skillLevel is NOT open — it's unset. The 30+/40+ age divisions in prod
 * carry null and are age-scoped, not open-to-every-level, so a level filter
 * correctly excludes them.
 */
function matchesLevel(skillLevel: string | null, level: string): boolean {
  if (level === "all") return true
  if (skillLevel === "open") return true
  return skillLevel === level
}

/** Youth = the program's audienceType is 'parents'; anything else is adult. */
function isYouth(s: FinderSeason): boolean {
  return s.program?.audienceType === "parents"
}

/** Ages chips render only when the catalog actually mixes both audiences. */
export function deriveAgesChips(seasons: FinderSeason[]): Chip[] {
  const hasYouth = seasons.some(isYouth)
  const hasAdult = seasons.some((s) => !isYouth(s))
  if (!hasYouth || !hasAdult) return []
  return [
    { value: "adult", label: "Adult" },
    { value: "youth", label: "Youth" },
  ]
}

function matchesAges(s: FinderSeason, ages: string | undefined): boolean {
  if (!ages || ages === "all") return true
  return ages === "youth" ? isYouth(s) : !isYouth(s)
}

export function filterSeasons(seasons: FinderSeason[], f: FinderFilters): FinderSeason[] {
  return seasons.filter((s) =>
    (f.location === "all" || s.location.slug === f.location) &&
    (f.division === "all" || s.divisionGender === f.division) &&
    (f.night === "all" || s.dayOfWeek === f.night) &&
    matchesLevel(s.skillLevel, f.level) &&
    matchesAges(s, f.ages),
  )
}
