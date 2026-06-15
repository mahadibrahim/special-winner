import { and, eq, inArray, asc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { rosters, teams } from "@/lib/db/schema/teams";
import { seasons, programs } from "@/lib/db/schema/programs";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";

export type VenueRosterPlayer = {
  playerName: string;
  status: string;
  jerseyNumber: string | null;
};
export type VenueRosterTeam = {
  teamId: string;
  teamName: string;
  players: VenueRosterPlayer[];
};

/**
 * Read-only roster reference for a venue manager: every team (with players)
 * whose season→program→location is in `locationIds`. Empty input → []. Editing
 * lives in the super-admin team detail, not here.
 */
export async function getVenueRosters(locationIds: string[]): Promise<VenueRosterTeam[]> {
  if (locationIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      playerName: familyMembers.firstName,
      lastName: familyMembers.lastName,
      status: rosters.status,
      jerseyNumber: rosters.jerseyNumber,
    })
    .from(rosters)
    .innerJoin(teams, eq(rosters.teamId, teams.id))
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
    .innerJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .where(inArray(programs.locationId, locationIds))
    .orderBy(asc(teams.name), asc(familyMembers.lastName));

  const byTeam = new Map<string, VenueRosterTeam>();
  for (const r of rows) {
    let t = byTeam.get(r.teamId);
    if (!t) {
      t = { teamId: r.teamId, teamName: r.teamName, players: [] };
      byTeam.set(r.teamId, t);
    }
    const name = `${r.playerName ?? ""} ${r.lastName ?? ""}`.trim();
    t.players.push({ playerName: name, status: r.status, jerseyNumber: r.jerseyNumber });
  }
  return [...byTeam.values()];
}
