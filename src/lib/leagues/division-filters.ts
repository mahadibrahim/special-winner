export const DIVISION_LEVELS = ["a", "b", "c", "d", "open"] as const;

export type DivisionLevel = (typeof DIVISION_LEVELS)[number];

export const DIVISION_LEVEL_LABEL: Record<DivisionLevel, string> = {
  a: "A · Elite",
  b: "B · Competitive",
  c: "C · Rec+",
  d: "D · Beginner",
  open: "Open",
};

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/**
 * The single source of truth for `seasons.division_gender`. Youth programs use
 * boys/girls, adult leagues use mens/womens, and coed spans both — a season is
 * one audience or the other, so all five live in one list rather than being
 * split by audienceType (the season dialog has no audienceType to gate on).
 *
 * Every value must fit the varchar(10) column in schema/programs.ts.
 */
export const DIVISION_GENDERS = ["coed", "boys", "girls", "mens", "womens"] as const;

export type DivisionGender = (typeof DIVISION_GENDERS)[number];

export const DIVISION_GENDER_LABEL: Record<DivisionGender, string> = {
  coed: "Coed",
  boys: "Boys",
  girls: "Girls",
  mens: "Men's",
  womens: "Women's",
};

/** Label a stored value, echoing anything unrecognised instead of guessing. */
export function divisionGenderLabel(value: string): string {
  return DIVISION_GENDER_LABEL[value as DivisionGender] ?? value;
}

export type Division = {
  id: string;
  seasonId: string;
  name: string;
  level: DivisionLevel;
  gender: DivisionGender;
  day: DayKey | null;
  time: string | null;
  venueSlug: string;
  venueName: string;
  status: "open" | "forming" | "active" | "completed";
  spotsLabel: string;
  signupModes: string[];
  /** Solo (per-player) list price in dollars — null when the season has no
   *  individual signup or the API didn't provide one. */
  price?: number | null;
  /** Early-bird-aware team total in dollars — null when the season has no
   *  team signup. Rendered as the "$200 down, $X total" row line. */
  teamTotal?: number | null;
};

export type DivisionFilters = {
  level: Exclude<DivisionLevel, "open"> | null;
  gender: DivisionGender | null;
  day: DayKey | null;
  venue: string | null;
};

export function filterDivisions(divisions: Division[], f: DivisionFilters): Division[] {
  return divisions.filter((d) => {
    // 'open' divisions accept all levels, so they pass any level filter.
    if (f.level && d.level !== f.level && d.level !== "open") return false;
    if (f.gender && d.gender !== f.gender) return false;
    if (f.day && d.day !== f.day) return false;
    if (f.venue && d.venueSlug !== f.venue) return false;
    return true;
  });
}

export const WEEK_ORDER: DayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const DAY_LABEL: Record<DayKey, string> = {
  mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
};

export interface DayGroup {
  day: DayKey | null;
  label: string;
  items: Division[];
}

/**
 * Group divisions into day-of-week sections in canonical WEEK_ORDER (mon→sun).
 * Empty days are omitted; divisions with no day collect into a trailing
 * "Day TBD" group so nothing silently disappears from the browse view.
 */
export function groupDivisionsByDay(divisions: Division[]): DayGroup[] {
  const groups: DayGroup[] = WEEK_ORDER.map((day) => ({
    day,
    label: DAY_LABEL[day],
    items: divisions.filter((d) => d.day === day),
  })).filter((g) => g.items.length > 0);

  const tbd = divisions.filter((d) => d.day == null);
  if (tbd.length) groups.push({ day: null, label: "Day TBD", items: tbd });
  return groups;
}
