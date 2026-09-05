export interface PlacementRegistration {
  registrationId: string;
  familyMemberId: string;
  birthDate: string | null; // ISO date or null (adult self rows)
  gender: string | null;
}
export interface PlacementTeam {
  teamId: string;
  name: string;
  currentCount: number; // published roster rows
  maxRosterSize: number | null; // null = uncapped
}
export interface DraftPlacementResult {
  assignments: Array<{ registrationId: string; teamId: string }>;
  unplaced: string[]; // registrationIds that fit nowhere (all teams at cap)
}

/**
 * Assign each registration to a team, spreading them as evenly as possible
 * across the roster. Pure + deterministic (no Date.now/randomness): inputs
 * are sorted by id before processing, so a caller's array ordering never
 * affects the result. Mirrors `balance-days.ts`'s style — greedy
 * least-loaded placement, first-minimum tie-break by `teamId` — with one
 * addition: a secondary gender-spread tie-break for the roster-balance use
 * case.
 *
 * - A team's load is `currentCount` plus registrations already drafted onto
 *   it in this call. A team at `maxRosterSize` (once load reaches it) stops
 *   receiving new registrations; `maxRosterSize: null` means uncapped.
 * - Among teams tied for least-loaded, prefer the team holding fewer
 *   registrations of the same `gender` placed so far in this call. A `null`
 *   gender never triggers the rule (ties then fall through to the plain
 *   first-minimum-by-`teamId` order).
 * - When no team has room for a registration (every team at cap, or there
 *   are no teams at all), the registration's id is collected into
 *   `unplaced` instead of being silently dropped.
 * - Registrations with a `null` birthDate place exactly like any other row
 *   — age/eligibility is out of scope here (the season is already
 *   age-homogeneous by the time this runs).
 */
export function draftPlacements(
  regs: PlacementRegistration[],
  teams: PlacementTeam[],
): DraftPlacementResult {
  const assignments: Array<{ registrationId: string; teamId: string }> = [];
  const unplaced: string[] = [];
  const sortedRegs = [...regs].sort((a, b) => a.registrationId.localeCompare(b.registrationId));

  if (teams.length === 0) {
    for (const r of sortedRegs) unplaced.push(r.registrationId);
    return { assignments, unplaced };
  }

  const sortedTeams = [...teams].sort((a, b) => a.teamId.localeCompare(b.teamId));
  const cap = new Map<string, number>(sortedTeams.map((t) => [t.teamId, t.maxRosterSize ?? Infinity]));
  const load = new Map<string, number>(sortedTeams.map((t) => [t.teamId, t.currentCount]));
  const genderLoad = new Map<string, Map<string, number>>(
    sortedTeams.map((t) => [t.teamId, new Map<string, number>()]),
  );

  for (const r of sortedRegs) {
    const eligible = sortedTeams.filter((t) => (load.get(t.teamId) ?? 0) < (cap.get(t.teamId) ?? Infinity));
    if (eligible.length === 0) {
      unplaced.push(r.registrationId);
      continue;
    }

    // Greedily pick the least-loaded eligible team, keeping the first
    // minimum found in teamId order. Only strictly-better candidates
    // replace `best`, so ties resolve to whichever came first.
    let best = eligible[0];
    for (const t of eligible) {
      const bestLoad = load.get(best.teamId) ?? 0;
      const tLoad = load.get(t.teamId) ?? 0;
      if (tLoad < bestLoad) {
        best = t;
      } else if (tLoad === bestLoad && r.gender) {
        const bestGenderCount = genderLoad.get(best.teamId)?.get(r.gender) ?? 0;
        const tGenderCount = genderLoad.get(t.teamId)?.get(r.gender) ?? 0;
        if (tGenderCount < bestGenderCount) best = t;
      }
    }

    assignments.push({ registrationId: r.registrationId, teamId: best.teamId });
    load.set(best.teamId, (load.get(best.teamId) ?? 0) + 1);
    if (r.gender) {
      const genderCounts = genderLoad.get(best.teamId)!;
      genderCounts.set(r.gender, (genderCounts.get(r.gender) ?? 0) + 1);
    }
  }

  return { assignments, unplaced };
}
