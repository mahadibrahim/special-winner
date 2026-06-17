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
