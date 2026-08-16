import type { Audience } from "@/lib/programs/derive";

/**
 * Division vocabularies for `seasons.skill_level` and `seasons.division_gender`.
 *
 * Youth and adult programs answer the same two questions with different words.
 * The level lists are fully disjoint on purpose: a stored level identifies its
 * own audience, so no consumer needs to join to programs.audience_type to read
 * it. Genders share only "coed".
 *
 * Width limits: levels must fit varchar(16), genders varchar(10). See
 * schema/programs.ts.
 */
export const ADULT_LEVELS = ["a", "b", "c", "d", "open"] as const;

/** Competitive youth leagues run A and B divisions; the other two don't split. */
export const YOUTH_LEVELS = [
  "competitive_a",
  "competitive_b",
  "developmental",
  "recreational",
] as const;

export const DIVISION_LEVELS = [...ADULT_LEVELS, ...YOUTH_LEVELS] as const;

export type DivisionLevel = (typeof DIVISION_LEVELS)[number];

/** Admin dropdown labels. For the customer-facing badge use skillLevelBadge. */
export const DIVISION_LEVEL_LABEL: Record<DivisionLevel, string> = {
  a: "A · Elite",
  b: "B · Competitive",
  c: "C · Rec+",
  d: "D · Beginner",
  open: "Open",
  // Plain space, not the "·" the adult labels use: "Competitive · B" and the
  // adult "B · Competitive" are near-identical at a glance in one dropdown.
  competitive_a: "Competitive A",
  competitive_b: "Competitive B",
  developmental: "Developmental",
  recreational: "Recreational",
};

export const ADULT_GENDERS = ["coed", "mens", "womens"] as const;
export const YOUTH_GENDERS = ["coed", "boys", "girls"] as const;

export const DIVISION_GENDERS = ["coed", "boys", "girls", "mens", "womens"] as const;

export type DivisionGender = (typeof DIVISION_GENDERS)[number];

export const DIVISION_GENDER_LABEL: Record<DivisionGender, string> = {
  coed: "Coed",
  boys: "Boys",
  girls: "Girls",
  mens: "Men's",
  womens: "Women's",
};

export type DayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Label a stored gender, echoing anything unrecognised instead of guessing. */
export function divisionGenderLabel(value: string): string {
  return DIVISION_GENDER_LABEL[value as DivisionGender] ?? value;
}

/**
 * The customer-facing level badge (registration rail).
 *
 * Adult keeps the established "Tier B" shouting. Youth gets the plain word a
 * parent understands — "Tier DEVELOPMENTAL" in a one-character badge is not a
 * thing anyone wants to read at checkout.
 */
export function skillLevelBadge(value: string | null | undefined): string {
  if (!value) return "";
  if ((ADULT_LEVELS as readonly string[]).includes(value)) return `Tier ${value.toUpperCase()}`;
  return DIVISION_LEVEL_LABEL[value as DivisionLevel] ?? value;
}

export interface VocabOption {
  value: string;
  label: string;
}

/**
 * Build dropdown options for one audience, keeping any stored value that
 * belongs to the other vocabulary.
 *
 * Until this shipped, both dropdowns offered the adult values on every season
 * regardless of audience, so youth seasons may already hold an adult value.
 * Dropping it would mean an admin who opens a season to change the price
 * silently erases a level someone set. The marker leads with the audience —
 * "Adult tier: B · Competitive" — because trailing it reads too much like the
 * youth "Competitive B" sitting two rows above.
 */
function optionsFor(
  own: readonly string[],
  labels: Record<string, string>,
  otherLabel: string,
  stored?: string | null,
): VocabOption[] {
  const options: VocabOption[] = own.map((value) => ({ value, label: labels[value] ?? value }));
  if (stored && !own.includes(stored)) {
    options.push({ value: stored, label: `${otherLabel}: ${labels[stored] ?? stored}` });
  }
  return options;
}

export function genderOptionsFor(audience: Audience, stored?: string | null): VocabOption[] {
  const own = audience === "adult" ? ADULT_GENDERS : YOUTH_GENDERS;
  const otherLabel = audience === "adult" ? "Youth tier" : "Adult tier";
  return optionsFor(own, DIVISION_GENDER_LABEL, otherLabel, stored);
}

export function levelOptionsFor(audience: Audience, stored?: string | null): VocabOption[] {
  const own = audience === "adult" ? ADULT_LEVELS : YOUTH_LEVELS;
  const otherLabel = audience === "adult" ? "Youth tier" : "Adult tier";
  return optionsFor(own, DIVISION_LEVEL_LABEL, otherLabel, stored);
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
