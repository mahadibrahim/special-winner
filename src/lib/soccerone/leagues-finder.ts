// src/lib/soccerone/leagues-finder.ts

export interface FinderSeason {
  id: string
  divisionGender: string | null   // 'coed' | 'mens' | 'womens'
  dayOfWeek: string | null         // 'mon'..'sun'
  location: { slug: string; name: string }
  // Presentational fields (name, status, price, etc.) ride along untyped on the
  // real payload; the finder only filters on the four fields above.
  [extra: string]: unknown
}

export interface FinderFilters {
  location: string  // slug | "all"
  division: string  // divisionGender | "all"
  night: string     // dayOfWeek | "all"
}

export interface Chip { value: string; label: string }

const DIVISION_LABELS: Record<string, string> = {
  coed: "Coed", mens: "Men's", womens: "Women's",
}

export const NIGHT_LABELS: Record<string, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
}

const WEEK_ORDER = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"]

export function deriveLocationChips(seasons: FinderSeason[]): Chip[] {
  const seen = new Map<string, string>()
  for (const s of seasons) {
    if (!seen.has(s.location.slug)) seen.set(s.location.slug, s.location.name)
  }
  return [...seen].map(([value, label]) => ({ value, label }))
}

export function deriveDivisionChips(seasons: FinderSeason[]): Chip[] {
  const seen: string[] = []
  for (const s of seasons) {
    if (s.divisionGender && !seen.includes(s.divisionGender)) seen.push(s.divisionGender)
  }
  return seen.map((value) => ({ value, label: DIVISION_LABELS[value] ?? value }))
}

export function deriveNightChips(seasons: FinderSeason[]): Chip[] {
  const present = new Set(seasons.map((s) => s.dayOfWeek).filter(Boolean) as string[])
  return WEEK_ORDER.filter((d) => present.has(d)).map((value) => ({ value, label: NIGHT_LABELS[value] }))
}

export function filterSeasons(seasons: FinderSeason[], f: FinderFilters): FinderSeason[] {
  return seasons.filter((s) =>
    (f.location === "all" || s.location.slug === f.location) &&
    (f.division === "all" || s.divisionGender === f.division) &&
    (f.night === "all" || s.dayOfWeek === f.night),
  )
}
