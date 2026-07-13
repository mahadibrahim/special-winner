/**
 * Org-scope cascade (locations → programs → seasons → teams), shared by
 * every admin surface that needs to test "is this user_roles scope inside
 * the caller's allowed location set" — today that's Person 360
 * (build-person-profile.ts's isUserInOrg) and the unified lookup endpoint
 * (lookup.ts).
 *
 * Both call sites used to walk the cascade as three separately-awaited
 * round trips (locations → programs, programs → seasons, seasons → teams).
 * This builds the same cascade as nested SQL subqueries instead — pass the
 * returned ids straight into `inArray(col, programIds)` /
 * `inArray(col, teamIds)` and Postgres resolves the whole chain inside the
 * single outer query that consumes them, at the cost of zero extra round
 * trips (mirrors the `orgTeamIds` technique in reports/attendance.ts).
 *
 * Returns `null` for both when `locationIds` is empty — there is nothing to
 * scope to, and an empty-array `inArray(...)` at the SQL level is not the
 * same as "no condition", so callers should omit the corresponding scope
 * condition entirely (see existing `...(x ? [cond] : [])` spread pattern).
 */
import { getDb } from "@/lib/db";
import { programs, seasons, teams } from "@/lib/db/schema";
import { inArray } from "drizzle-orm";

export interface OrgScopeCascade {
  /** Subquery: program ids whose locationId is in `locationIds`. */
  programIds: ReturnType<typeof buildProgramIds> | null;
  /** Subquery: team ids whose season's program is in the cascade above. */
  teamIds: ReturnType<typeof buildTeamIds> | null;
}

function buildProgramIds(locationIds: string[]) {
  return getDb()
    .select({ id: programs.id })
    .from(programs)
    .where(inArray(programs.locationId, locationIds));
}

function buildSeasonIds(programIds: ReturnType<typeof buildProgramIds>) {
  return getDb()
    .select({ id: seasons.id })
    .from(seasons)
    .where(inArray(seasons.programId, programIds));
}

function buildTeamIds(seasonIds: ReturnType<typeof buildSeasonIds>) {
  return getDb()
    .select({ id: teams.id })
    .from(teams)
    .where(inArray(teams.seasonId, seasonIds));
}

export function buildOrgScopeCascade(locationIds: string[]): OrgScopeCascade {
  if (locationIds.length === 0) {
    return { programIds: null, teamIds: null };
  }
  const programIds = buildProgramIds(locationIds);
  const seasonIds = buildSeasonIds(programIds);
  const teamIds = buildTeamIds(seasonIds);
  return { programIds, teamIds };
}
