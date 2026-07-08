import { and, eq, lt, ne, asc, sql, desc, inArray } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { getDb } from "@/lib/db";
import { games, gameOfficials, gameIncidents, teams } from "@/lib/db/schema/teams";
import { suspensions, type Suspension } from "@/lib/db/schema/suspensions";
import { timeEntries } from "@/lib/db/schema/time-tracking";

// Suspension statuses that mean "this person currently can't play/coach" —
// excludes 'served' (already completed) and 'appealed' (under review, not
// an active bar). Director-driven escalation to 'season'/'permanent' still
// counts as active for banner purposes.
const ACTIVE_SUSPENSION_STATUSES = ["active", "season", "permanent"] as const;

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
  homeTeamId: string | null;
  awayTeamId: string | null;
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
  activeSuspensions: ActiveSuspensionFlag[];
  /** This referee's check-in for this match, if any (Task 13 — drives the check-in/out controls). */
  checkIn: RefereeCheckInStatus | null;
};

export type RefereeCheckInStatus = {
  id: string;
  clockInAt: string;
  clockOutAt: string | null;
  flaggedOutOfRange: boolean;
};

export type ActiveSuspensionFlag = {
  id: string;
  personName: string;
  teamId: string;
  status: Suspension["status"];
  gamesMissed: number;
  gamesServed: number;
  escalatedToDirector: boolean;
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
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
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

  // Excludes type='ejection': those are managed exclusively through the
  // ejections endpoint/form + activeSuspensions banner below, never through
  // the bulk-editable incidents list on the /report page. MatchReport's type
  // <select> has no "ejection" option, so surfacing one here would let it
  // round-trip back into a /report submit's bulk `incidents` array — which
  // Task 5's guard on report.ts now rejects with 400, breaking the whole
  // resubmit for any game with an ejection on it.
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
    .where(and(eq(gameIncidents.gameId, gameId), ne(gameIncidents.type, "ejection")))
    .orderBy(asc(gameIncidents.minute));

  // Team-level flag for either roster in this game — empty for a TBD-team
  // game (homeTeamId/awayTeamId null, e.g. an unfilled fixture slot).
  const teamIds = [row.homeTeamId, row.awayTeamId].filter(
    (id): id is string => id != null,
  );
  const activeSuspensions =
    teamIds.length > 0
      ? await db
          .select({
            id: suspensions.id,
            personName: suspensions.personName,
            teamId: suspensions.teamId,
            status: suspensions.status,
            gamesMissed: suspensions.gamesMissed,
            gamesServed: suspensions.gamesServed,
            escalatedToDirector: suspensions.escalatedToDirector,
          })
          .from(suspensions)
          .where(
            and(
              inArray(suspensions.teamId, teamIds),
              inArray(suspensions.status, ACTIVE_SUSPENSION_STATUSES),
            ),
          )
          .orderBy(asc(suspensions.createdAt))
      : [];

  const [checkInRow] = await db
    .select({
      id: timeEntries.id,
      clockInAt: timeEntries.clockInAt,
      clockOutAt: timeEntries.clockOutAt,
      flaggedOutOfRange: timeEntries.flaggedOutOfRange,
    })
    .from(timeEntries)
    .where(and(eq(timeEntries.gameId, gameId), eq(timeEntries.userId, userId)))
    .orderBy(desc(timeEntries.createdAt))
    .limit(1);

  const checkIn: RefereeCheckInStatus | null = checkInRow
    ? {
        id: checkInRow.id,
        clockInAt: checkInRow.clockInAt.toISOString(),
        clockOutAt: checkInRow.clockOutAt ? checkInRow.clockOutAt.toISOString() : null,
        flaggedOutOfRange: checkInRow.flaggedOutOfRange,
      }
    : null;

  return { ...row, incidents, activeSuspensions, checkIn };
}
