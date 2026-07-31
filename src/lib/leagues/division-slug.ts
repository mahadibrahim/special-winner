// Stable, keyword-bearing URL slugs for per-division league pages, derived
// from division metadata (never from the display name, which carries the
// term label). One division = one seasons row; seasons.slug alone collides
// across venues (unique only per program), so the venue slug is part of the
// URL identity.
//
// Example: coed + skill "b" + wed + worthington -> "co-ed-b-wednesday-worthington"
//          coed + minAge 30 + sun + worthington -> "co-ed-30-plus-sunday-worthington"

export interface SeasonForDivisionSlug {
  id: string;
  slug?: string | null;
  divisionGender?: string | null;
  skillLevel?: string | null;
  dayOfWeek?: string | null;
  minAge?: number | null;
  location: { slug: string; name?: string | null; state?: string | null };
}

const GENDER_SLUG: Record<string, string> = { coed: "co-ed", mens: "mens", womens: "womens" };
const GENDER_LABEL: Record<string, string> = { coed: "Co-Ed", mens: "Men's", womens: "Women's" };

const DAY_SLUG: Record<string, string> = {
  mon: "monday", tue: "tuesday", wed: "wednesday", thu: "thursday",
  fri: "friday", sat: "saturday", sun: "sunday",
};
const DAY_LABEL: Record<string, string> = {
  mon: "Monday", tue: "Tuesday", wed: "Wednesday", thu: "Thursday",
  fri: "Friday", sat: "Saturday", sun: "Sunday",
};

/** "30+" age-qualified divisions carry the qualifier instead of a skill letter. */
function ageQualifier(minAge: number | null | undefined): string | null {
  return minAge != null && minAge >= 30 ? `${minAge}+` : null;
}

function tierPart(s: SeasonForDivisionSlug): string | null {
  const age = ageQualifier(s.minAge);
  if (age) return age.replace("+", "-plus");
  if (s.skillLevel && s.skillLevel !== "open") return s.skillLevel;
  return null;
}

export function divisionSlug(s: SeasonForDivisionSlug): string {
  const parts = [
    GENDER_SLUG[s.divisionGender ?? ""] ?? null,
    tierPart(s),
    s.dayOfWeek ? DAY_SLUG[s.dayOfWeek] ?? null : null,
    s.location.slug,
  ].filter(Boolean);
  // Degenerate metadata (fixtures, drafts) can produce just the venue slug;
  // fall back to the seasons.slug so the URL stays unique and stable.
  if (parts.length < 2 && s.slug) return `${s.slug}-${s.location.slug}`;
  return parts.join("-");
}

/**
 * Map every season in a term to its division URL slug. Collisions (two rows
 * with identical gender/tier/day/venue) keep the first and disambiguate the
 * rest with seasons.slug, so no URL ever serves two divisions.
 */
export function divisionSlugMap<T extends SeasonForDivisionSlug>(seasonRows: T[]): Map<string, T> {
  const map = new Map<string, T>();
  for (const s of seasonRows) {
    let slug = divisionSlug(s);
    if (map.has(slug)) slug = `${s.slug ?? s.id}-${s.location.slug}`;
    if (!map.has(slug)) map.set(slug, s);
  }
  return map;
}

export interface DivisionNaming {
  /** "Co-Ed B" / "Co-Ed 30+" / "Men's" — tier-qualified division label. */
  label: string;
  /** "Co-Ed B Wednesday" — label + night, for headings. */
  headline: string;
  /** SEO title, e.g. "Co-Ed B Wednesday Adult Soccer League — Worthington, OH | Fall 2026" */
  title: string;
}

export function divisionNaming(
  s: SeasonForDivisionSlug,
  sportName: string,
  termLabel: string,
): DivisionNaming {
  const gender = GENDER_LABEL[s.divisionGender ?? ""] ?? "";
  const age = ageQualifier(s.minAge);
  const tier = age ?? (s.skillLevel && s.skillLevel !== "open" ? s.skillLevel.toUpperCase() : "");
  const label = [gender, tier].filter(Boolean).join(" ") || "Open";
  const day = s.dayOfWeek ? DAY_LABEL[s.dayOfWeek] ?? "" : "";
  const headline = [label, day].filter(Boolean).join(" ");
  const place = [s.location.name ?? s.location.slug, s.location.state ?? "OH"].filter(Boolean).join(", ");
  const title = `${headline} Adult ${sportName} League — ${place} | ${termLabel}`;
  return { label, headline, title };
}
