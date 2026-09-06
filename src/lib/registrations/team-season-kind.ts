// Youth-vs-adult predicate for team registrations.
//
// A team registration hangs off a season, and a season is "youth" iff its
// resolved minimum age is a real number under 18. The resolution order is
// season.minAge first (an explicit override), falling back to the season's
// age group's minAge — mirroring `row.minAge ?? row.ageGroupMinAge` because
// callers project both columns off a single joined row rather than nesting
// an ageGroup object (contrast with `isYouthSeasonRow` in
// src/lib/leagues/youth-seasons.ts, which reads season.ageGroup.minAge off a
// nested join result for a different endpoint's shape).
//
// A null-resolved minAge (no explicit minAge AND no age group at all) is
// treated as ADULT, not youth. This is a deliberate fail-toward-existing-
// behavior choice, not an oversight: adult seasons are seeded with a real
// "Adult 18+" age group (a genuine numeric minAge of 18), so a resolved
// value of null only ever means "this season has no age group data at
// all" — an unknown/open case, never a real youth signal. Youth surfaces
// are age-group-led by construction (see youth-seasons.ts's doc block:
// pathway names, division slugs, and headlines all read off a real age
// group), so a row that resolves to null has nothing youth-shaped to
// anchor on. This predicate backs money-grade logic (deposit refund
// handling), so an ambiguous row must default to the existing adult
// behavior rather than opt an unknown season into new youth-only paths.
export function isYouthTeamSeason(row: {
  minAge: number | null;
  ageGroupMinAge: number | null;
}): boolean {
  const resolvedMinAge = row.minAge ?? row.ageGroupMinAge;
  return typeof resolvedMinAge === "number" && resolvedMinAge < 18;
}
