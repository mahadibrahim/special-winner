/**
 * DB feeder for the pure cadence functions (Phase 4).
 *
 * Scoping choices (see the phase plan's Design Decisions):
 *  - "last assessed" uses ANY player_assessments row for the family member —
 *    staleness is a property of the player's record, not of one coach/team.
 *  - roster rows are not filtered by status, matching getCoachPlayerIds.
 */
import { asc, eq, inArray, sql } from "drizzle-orm";
import type { Database } from "@/lib/db";
import { playerAssessments } from "@/lib/db/schema/assessments";
import { skills, skillDomains } from "@/lib/db/schema/curriculum";
import { rosters, teams } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import {
  computeCadenceMatrix,
  type LastAssessedRow,
  type PlayerCadence,
} from "./assessment-cadence";

export interface TeamCadence {
  teamId: string;
  teamName: string;
  players: PlayerCadence[];
}

/**
 * Full player × domain cadence for a set of teams. One batch of queries for
 * the whole set (teams, rosters, domains, last-assessed), then pure compute.
 */
export async function getTeamCadence(
  db: Database,
  teamIds: string[],
  now: Date,
): Promise<TeamCadence[]> {
  if (teamIds.length === 0) return [];

  const teamRows = await db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, teamIds))
    .orderBy(asc(teams.name));

  const rosterRows = await db
    .select({
      teamId: rosters.teamId,
      familyMemberId: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
    })
    .from(rosters)
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .where(inArray(rosters.teamId, teamIds));

  const domainRows = await db
    .select({
      domainId: skillDomains.id,
      displayName: skillDomains.displayName,
      assessmentFrequency: skillDomains.assessmentFrequency,
    })
    .from(skillDomains)
    .orderBy(asc(skillDomains.sortOrder));

  const playerIds = [...new Set(rosterRows.map((r) => r.familyMemberId))];

  const lastRows =
    playerIds.length === 0
      ? []
      : await db
          .select({
            familyMemberId: playerAssessments.familyMemberId,
            domainId: skills.domainId,
            lastAssessedAt: sql<
              string | Date
            >`max(${playerAssessments.assessedAt})`,
          })
          .from(playerAssessments)
          .innerJoin(skills, eq(playerAssessments.skillId, skills.id))
          .where(inArray(playerAssessments.familyMemberId, playerIds))
          .groupBy(playerAssessments.familyMemberId, skills.domainId);

  // max() over a timestamp comes back as a string from some drivers; normalize.
  const lastAssessed: LastAssessedRow[] = lastRows.map((r) => ({
    familyMemberId: r.familyMemberId,
    domainId: r.domainId,
    lastAssessedAt:
      r.lastAssessedAt instanceof Date
        ? r.lastAssessedAt
        : new Date(r.lastAssessedAt),
  }));

  return teamRows.map((team) => {
    const seen = new Set<string>();
    const teamPlayers = rosterRows
      .filter((r) => r.teamId === team.id)
      .filter((r) => {
        if (seen.has(r.familyMemberId)) return false;
        seen.add(r.familyMemberId);
        return true;
      })
      .map((r) => ({
        familyMemberId: r.familyMemberId,
        firstName: r.firstName,
        lastName: r.lastName,
      }));

    return {
      teamId: team.id,
      teamName: team.name,
      players: computeCadenceMatrix(teamPlayers, domainRows, lastAssessed, now),
    };
  });
}

/**
 * Badge count: distinct players across the teams with at least one domain
 * due, overdue, or never assessed.
 */
export async function getAssessmentsDueCount(
  db: Database,
  teamIds: string[],
  now: Date,
): Promise<number> {
  const cadence = await getTeamCadence(db, teamIds, now);
  const duePlayers = new Set<string>();
  for (const team of cadence) {
    for (const player of team.players) {
      if (player.worstStatus !== "fresh") duePlayers.add(player.familyMemberId);
    }
  }
  return duePlayers.size;
}
