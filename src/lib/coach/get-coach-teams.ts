import { eq, or, asc, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { teams, rosters } from "@/lib/db/schema/teams";

export type CoachTeam = {
  teamId: string;
  teamName: string;
  playerCount: number;
};

/**
 * Teams the user coaches — head OR assistant. Player count is a scalar subquery
 * over rosters so a team with no players yet still returns (count 0).
 */
export async function getCoachTeams(userId: string): Promise<CoachTeam[]> {
  const db = getDb();
  return db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      playerCount: sql<number>`(SELECT COUNT(*)::int FROM ${rosters} WHERE ${rosters.teamId} = ${teams.id})`,
    })
    .from(teams)
    .where(or(eq(teams.coachUserId, userId), eq(teams.assistantCoachUserId, userId)))
    .orderBy(asc(teams.name));
}
