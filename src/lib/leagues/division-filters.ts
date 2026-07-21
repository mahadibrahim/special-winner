export type DivisionLevel = "a" | "b" | "c" | "d" | "open";
export type DivisionGender = "coed" | "mens" | "womens";
export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

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
