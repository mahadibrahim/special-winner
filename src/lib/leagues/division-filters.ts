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

/** Admin dropdown labels. Customer-facing badges use railTierBadge (the
 *  registration rail, split desktop/mobile) or skillLevelShort (catalog
 *  cards) — a single-string helper here has already caused one breakpoint
 *  regression, so there deliberately isn't one. */
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
 * Short-form level badge — no "Tier" prefix. Adult values render as the bare
 * uppercase letter ("B"), "open" renders "Open", youth values render their
 * plain label. Used by catalog cards (SoccerOneLeaguesFinder,
 * divisions-finder) that already show a separate "Youth"/status chip and
 * don't want the "TIER" wording railTierBadge adds for the registration
 * rail.
 */
export function skillLevelShort(value: string | null | undefined): string {
  if (!value) return "";
  const k = value.trim().toLowerCase();
  if (k === "open") return "Open";
  if ((ADULT_LEVELS as readonly string[]).includes(k)) return k.toUpperCase();
  return DIVISION_LEVEL_LABEL[k as DivisionLevel] ?? value;
}

export interface RailTierBadge {
  /** Desktop rail badge text, e.g. "TIER B" (adult) or "Developmental" (youth). */
  desktop: string;
  /** Mobile pinned-strip chip text, e.g. "B" (adult) or "Developmental" (youth). */
  mobile: string;
  /** True when the value is an adult tier — the rail uses this to match any
   *  appended suffix (" · REGISTERED") to the badge's ALL-CAPS treatment,
   *  while youth suffixes stay plain words like the rest of the youth copy. */
  isAdult: boolean;
}

/**
 * Desktop + mobile skill-level badge text for the registration context rail
 * (league-context-rail.tsx).
 *
 * Before the youth vocabulary landed, both badges rendered from a single
 * uppercased value plus a shared CSS `uppercase` class: desktop showed
 * "Tier {value}" (visually "TIER B"), mobile showed the bare "{value}"
 * (visually "B"). Once youth needed mixed-case text ("Developmental") that
 * shared uppercase class had to come off both spans — so adult's ALL-CAPS
 * styling is now baked into the strings this returns instead of left to CSS.
 * Youth renders the same plain label at both breakpoints, unchanged.
 */
export function railTierBadge(value: string | null | undefined): RailTierBadge {
  if (!value) return { desktop: "", mobile: "", isAdult: false };
  const k = value.trim().toLowerCase();
  if ((ADULT_LEVELS as readonly string[]).includes(k)) {
    const letter = k.toUpperCase();
    return { desktop: `TIER ${letter}`, mobile: letter, isAdult: true };
  }
  const label = DIVISION_LEVEL_LABEL[k as DivisionLevel] ?? value;
  return { desktop: label, mobile: label, isAdult: false };
}

export interface VocabOption {
  value: string;
  label: string;
}

/**
 * Build dropdown options for one audience, keeping any stored value that
 * belongs to the other vocabulary — or to neither.
 *
 * Until this shipped, both dropdowns offered the adult values on every season
 * regardless of audience, so youth seasons may already hold an adult value.
 * Dropping it would mean an admin who opens a season to change the price
 * silently erases a level someone set. The marker leads with the audience —
 * "Adult tier: B · Competitive" — because trailing it reads too much like the
 * youth "Competitive B" sitting two rows above.
 *
 * A stored value that belongs to NEITHER vocabulary (a legacy/junk value) is
 * not an adult value just because it isn't a youth one — it gets the neutral
 * "Stored: " marker instead of being mislabelled as the other audience.
 */
function optionsFor(
  own: readonly string[],
  other: readonly string[],
  labels: Record<string, string>,
  otherLabel: string,
  stored?: string | null,
): VocabOption[] {
  const options: VocabOption[] = own.map((value) => ({ value, label: labels[value] ?? value }));
  if (stored && !own.includes(stored)) {
    const prefix = other.includes(stored) ? otherLabel : "Stored";
    options.push({ value: stored, label: `${prefix}: ${labels[stored] ?? stored}` });
  }
  return options;
}

export function genderOptionsFor(audience: Audience, stored?: string | null): VocabOption[] {
  const own = audience === "adult" ? ADULT_GENDERS : YOUTH_GENDERS;
  const other = audience === "adult" ? YOUTH_GENDERS : ADULT_GENDERS;
  // "division", not "tier" — a gender is not a tier. levelOptionsFor keeps
  // the "tier" wording below.
  const otherLabel = audience === "adult" ? "Youth division" : "Adult division";
  return optionsFor(own, other, DIVISION_GENDER_LABEL, otherLabel, stored);
}

export function levelOptionsFor(audience: Audience, stored?: string | null): VocabOption[] {
  const own = audience === "adult" ? ADULT_LEVELS : YOUTH_LEVELS;
  const other = audience === "adult" ? YOUTH_LEVELS : ADULT_LEVELS;
  const otherLabel = audience === "adult" ? "Youth tier" : "Adult tier";
  return optionsFor(own, other, DIVISION_LEVEL_LABEL, otherLabel, stored);
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

const KNOWN_GENDERS: readonly string[] = DIVISION_GENDERS;

/**
 * Narrow a raw DB string (seasons.division_gender is an unconstrained
 * varchar, not a real Postgres enum) to a known DivisionGender, falling back
 * to "coed" for anything unrecognized. Prefer this over `as Division["gender"]`
 * at call sites — a force-cast asserts the value is safe without checking,
 * which is exactly how a "girls" row silently rendering as "Coed" (and being
 * hidden by its own filter chip) went unnoticed.
 */
export function toDivisionGender(raw: string | null | undefined): DivisionGender {
  return KNOWN_GENDERS.includes(raw ?? "") ? (raw as DivisionGender) : "coed";
}

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
