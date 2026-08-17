// Authored youth age groups for the 2026-27 seasonal year.
//
// US Soccer mandated calendar-year grouping from 2017 through 2025-26. That
// mandate was lifted in late 2024, and US Youth Soccer, US Club Soccer and
// AYSO all moved to an Aug 1 - Jul 31 window beginning with 2026-27 to
// realign groups with school grade.
//
// These are AUTHORED CONSTANTS, deliberately not derived from
// age_groups.minAge/maxAge — an integer age range cannot express an Aug-Jul
// window. Roll SEASONAL_YEAR_START forward each seasonal year.
//
// Consequence worth remembering: a birth YEAR no longer identifies a group.
// Someone born in 2017 is U9 (Aug-Dec) or U10 (Jan-Jul).

export interface YouthAgeGroup {
  /** URL/filter key, e.g. "u10". */
  key: string
  /** Display name, e.g. "U10". */
  label: string
  /** ISO date, inclusive start of the birth window. */
  bornFrom: string
  /** ISO date, inclusive end of the birth window. */
  bornTo: string
  /** Human range, e.g. "Aug 1, 2016 – Jul 31, 2017". */
  rangeLabel: string
}

/** First calendar year of the seasonal year: 2026 for the 2026-27 season. */
export const SEASONAL_YEAR_START = 2026

const YOUNGEST = 6
const OLDEST = 19

function buildGroup(n: number): YouthAgeGroup {
  const fromYear = SEASONAL_YEAR_START - n
  const toYear = fromYear + 1
  return {
    key: `u${n}`,
    label: `U${n}`,
    bornFrom: `${fromYear}-08-01`,
    bornTo: `${toYear}-07-31`,
    rangeLabel: `Aug 1, ${fromYear} – Jul 31, ${toYear}`,
  }
}

/** U6 (youngest) first through U19 (oldest) — the order the ladder renders. */
export const YOUTH_AGE_GROUPS: YouthAgeGroup[] = Array.from(
  { length: OLDEST - YOUNGEST + 1 },
  (_, i) => buildGroup(YOUNGEST + i),
)

/**
 * Resolve a birthday to its age group. `birthMonth` is 1-12.
 *
 * A birthday in Aug-Dec belongs to the window starting that calendar year;
 * Jan-Jul belongs to the window that started the previous year.
 */
export function resolveAgeGroup(
  birthMonth: number,
  birthYear: number,
): YouthAgeGroup | null {
  if (birthMonth < 1 || birthMonth > 12) return null
  const windowStartYear = birthMonth >= 8 ? birthYear : birthYear - 1
  const n = SEASONAL_YEAR_START - windowStartYear
  return YOUTH_AGE_GROUPS.find((g) => g.key === `u${n}`) ?? null
}
