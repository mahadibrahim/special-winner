import { and, eq, lt, ne, asc, sql, desc } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { games, gameOfficials, gameIncidents, teams } from "@/lib/db/schema/teams";

export type RefereeAssignment = {
  gameId: string;
  scheduledAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  position: string;
  reported: boolean;
};

/** The ref's assigned matches (newest scheduled first), each flagged reported. */
export async function getRefereeAssignments(userId: string): Promise<RefereeAssignment[]> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  const rows = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      homeTeamName: home.name,
      awayTeamName: away.name,
      position: gameOfficials.position,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(eq(gameOfficials.userId, userId))
    .orderBy(desc(games.scheduledAt));
  return rows.map((r) => ({ ...r, reported: r.status === "completed" }));
}

/** Count of past assigned games whose result is still owed (not completed). */
export async function getReportsOwed(userId: string): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .where(
      and(
        eq(gameOfficials.userId, userId),
        lt(games.scheduledAt, new Date()),
        ne(games.status, "completed"),
      ),
    );
  return row?.count ?? 0;
}

export type RefereeMatchDetail = {
  gameId: string;
  scheduledAt: Date;
  status: string;
  homeScore: number | null;
  awayScore: number | null;
  refereeNotes: string | null;
  homeTeamName: string | null;
  awayTeamName: string | null;
  incidents: Array<{
    id: string;
    type: string;
    side: string;
    player: string | null;
    minute: number | null;
    description: string | null;
  }>;
};

/**
 * Full match detail for the report page, but ONLY if the caller is an assigned
 * official on the game. Returns null otherwise (the page 404s).
 */
export async function getRefereeMatchDetail(userId: string, gameId: string): Promise<RefereeMatchDetail | null> {
  const db = getDb();
  const home = alias(teams, "home_team");
  const away = alias(teams, "away_team");
  const [row] = await db
    .select({
      gameId: games.id,
      scheduledAt: games.scheduledAt,
      status: games.status,
      homeScore: games.homeScore,
      awayScore: games.awayScore,
      refereeNotes: games.refereeNotes,
      homeTeamName: home.name,
      awayTeamName: away.name,
    })
    .from(gameOfficials)
    .innerJoin(games, eq(games.id, gameOfficials.gameId))
    .leftJoin(home, eq(home.id, games.homeTeamId))
    .leftJoin(away, eq(away.id, games.awayTeamId))
    .where(and(eq(gameOfficials.userId, userId), eq(gameOfficials.gameId, gameId)))
    .limit(1);
  if (!row) return null;

  const incidents = await db
    .select({
      id: gameIncidents.id,
      type: gameIncidents.type,
      side: gameIncidents.side,
      player: gameIncidents.player,
      minute: gameIncidents.minute,
      description: gameIncidents.description,
    })
    .from(gameIncidents)
    .where(eq(gameIncidents.gameId, gameId))
    .orderBy(asc(gameIncidents.minute));
  return { ...row, incidents };
}
