import { getDb } from "@/lib/db";
import {
  rosters,
  registrations,
  familyMembers,
  games,
  teams,
} from "@/lib/db/schema";
import { shootSessions } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";

export type TaggerRosterEntry = {
  id: string;
  first_name: string;
  last_initial: string;
  jersey_number: string | null;
  photo_url: string | null;
  roster_id: string;
};

export type TaggerRoster = {
  home: { team_id: string | null; team_name: string | null; players: TaggerRosterEntry[] };
  away: { team_id: string | null; team_name: string | null; players: TaggerRosterEntry[] };
};

export async function getTaggerRoster(sessionId: string): Promise<TaggerRoster> {
  const db = getDb();
  const session = await db.query.shootSessions.findFirst({
    where: eq(shootSessions.id, sessionId),
    columns: { gameId: true },
  });

  const empty = {
    home: { team_id: null, team_name: null, players: [] as TaggerRosterEntry[] },
    away: { team_id: null, team_name: null, players: [] as TaggerRosterEntry[] },
  };

  if (!session?.gameId) return empty;

  const game = await db.query.games.findFirst({
    where: eq(games.id, session.gameId),
    columns: { homeTeamId: true, awayTeamId: true },
  });
  if (!game) return empty;

  async function loadTeam(teamId: string | null) {
    if (!teamId) {
      return { team_id: null, team_name: null, players: [] as TaggerRosterEntry[] };
    }
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, teamId),
      columns: { id: true, name: true },
    });

    const rows = await db
      .select({
        rosterId: rosters.id,
        jerseyNumber: rosters.jerseyNumber,
        familyMemberId: familyMembers.id,
        firstName: familyMembers.firstName,
        lastName: familyMembers.lastName,
        photoUrl: familyMembers.photoUrl,
      })
      .from(rosters)
      .innerJoin(registrations, eq(rosters.registrationId, registrations.id))
      .innerJoin(
        familyMembers,
        eq(registrations.familyMemberId, familyMembers.id)
      )
      .where(eq(rosters.teamId, teamId));

    return {
      team_id: team?.id ?? teamId,
      team_name: team?.name ?? null,
      players: rows.map((r) => ({
        id: r.familyMemberId,
        first_name: r.firstName,
        last_initial: (r.lastName ?? "").charAt(0).toUpperCase(),
        jersey_number: r.jerseyNumber,
        photo_url: r.photoUrl,
        roster_id: r.rosterId,
      })),
    };
  }

  const [home, away] = await Promise.all([
    loadTeam(game.homeTeamId),
    loadTeam(game.awayTeamId),
  ]);

  return { home, away };
}
