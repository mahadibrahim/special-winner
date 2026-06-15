import { eq, inArray, asc } from "drizzle-orm";
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
 * Read-only roster reference for a venue manager: every team whose
 * season→program→location is in `locationIds`, each with its players. Empty
 * input → []. Editing lives in the super-admin team detail, not here.
 *
 * Driven from `teams` with LEFT JOINs to the roster chain so a team with no
 * players yet still appears (with an empty `players` array) — the UI renders
 * its "no players yet" empty state rather than the team vanishing entirely.
 */
export async function getVenueRosters(locationIds: string[]): Promise<VenueRosterTeam[]> {
  if (locationIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({
      teamId: teams.id,
      teamName: teams.name,
      rosterId: rosters.id,
      playerName: familyMembers.firstName,
      lastName: familyMembers.lastName,
      status: rosters.status,
      jerseyNumber: rosters.jerseyNumber,
    })
    .from(teams)
    .innerJoin(seasons, eq(teams.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .leftJoin(rosters, eq(rosters.teamId, teams.id))
    .leftJoin(registrations, eq(rosters.registrationId, registrations.id))
    .leftJoin(familyMembers, eq(registrations.familyMemberId, familyMembers.id))
    .where(inArray(programs.locationId, locationIds))
    .orderBy(asc(teams.name), asc(familyMembers.lastName));

  const byTeam = new Map<string, VenueRosterTeam>();
  for (const r of rows) {
    let t = byTeam.get(r.teamId);
    if (!t) {
      t = { teamId: r.teamId, teamName: r.teamName, players: [] };
      byTeam.set(r.teamId, t);
    }
    // A team with no roster entries produces a single row with null roster
    // fields (from the left join) — register the team but add no player.
    if (r.rosterId != null) {
      const name = `${r.playerName ?? ""} ${r.lastName ?? ""}`.trim();
      t.players.push({ playerName: name, status: r.status ?? "", jerseyNumber: r.jerseyNumber });
    }
  }
  return [...byTeam.values()];
}
