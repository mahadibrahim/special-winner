// Youth audience guard for rows returned by /api/public/seasons.
//
// `?audience=youth` is deliberately permissive: seasons.ts matches
// `(ageGroupId IS NULL OR ageGroups.minAge < 18)` — a season with no age group
// is treated as "open to all" and included in BOTH the youth and the adult
// view. /api/admin/seasons makes ageGroupId optional on create, so a single
// adult season authored without an age group would surface on the youth league
// routes: rendered as "<Term> · Youth Soccer" with the youth Coed/Boys/Girls
// chip set (an adult Men's row becomes unfilterable), and given its own
// /youth/leagues/soccer/<term>/<division> URL — a duplicate-content twin of an
// already-indexed adult division page.
//
// The youth surfaces are age-group-led by construction (the ladder, the
// division slugs, the headlines all read `season.ageGroup.name`), so a row with
// no age group has nothing to render there anyway. Require a real youth age
// group rather than trusting the endpoint's permissive OR.
//
// Scoped to youth on purpose. Adult loading must stay byte-identical: adult
// seasons carry a real, seeded "Adult 18+" group, and the adult view's own
// `ageGroupId IS NULL` branch is long-standing behavior this must not touch.
//
// Note on the shape: because the SQL guard above only admits an ageGroup row
// when `minAge < 18` is TRUE, any row that arrives WITH an ageGroup already has
// a non-null numeric minAge below 18. The `>= 18` half of this predicate is
// therefore defense-in-depth against the endpoint's filter changing, not a case
// the current endpoint can produce.
export function isYouthSeasonRow(season: any): boolean {
  const minAge = season?.ageGroup?.minAge;
  return typeof minAge === "number" && minAge < 18;
}

/** Drop age-group-less / adult rows from a youth season list. */
export function filterYouthSeasons<T>(seasons: T[]): T[] {
  return seasons.filter((s) => isYouthSeasonRow(s));
}
