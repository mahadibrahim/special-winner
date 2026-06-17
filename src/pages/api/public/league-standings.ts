import type { APIRoute } from "astro";
import { db } from "@/lib/db";
import { seasons, programs, sports, teams as teamsTable, games as gamesTable, organizations } from "@/lib/db/schema";
import { eq, and, asc } from "drizzle-orm";
import { computeStandings, rulesForSport, type GameInput } from "@/lib/leagues/standings";

function json(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  });
}

export const GET: APIRoute = async ({ url, locals }) => {
  const organization = locals.organization;
  const seasonId = url.searchParams.get("seasonId");
  const empty = { season: null, rules: { allowDraws: true }, standings: [], results: [] };
  if (!organization || !seasonId || !db) return json(empty);

  try {
    const [row] = await db
      .select({ season: seasons, sportSlug: sports.slug })
      .from(seasons)
      .innerJoin(programs, eq(seasons.programId, programs.id))
      .innerJoin(sports, eq(programs.sportId, sports.id))
      .innerJoin(organizations, eq(organizations.id, sports.organizationId))
      .where(
        and(
          eq(seasons.id, seasonId),
          eq(organizations.id, organization.id),
          eq(organizations.status, "active"),
          eq(seasons.isTest, false),
          eq(programs.isTest, false),
        ),
      )
      .limit(1);
    if (!row) return json(empty);

    const rules = rulesForSport(row.sportSlug);

    const teamRows = await db
      .select({ id: teamsTable.id, name: teamsTable.name })
      .from(teamsTable)
      .where(eq(teamsTable.seasonId, seasonId))
      .orderBy(asc(teamsTable.name));

    const gameRows = await db.select().from(gamesTable).where(eq(gamesTable.seasonId, seasonId));

    const standings = computeStandings(
      teamRows,
      gameRows.map<GameInput>((g) => ({
        homeTeamId: g.homeTeamId,
        awayTeamId: g.awayTeamId,
        homeScore: g.homeScore,
        awayScore: g.awayScore,
        status: g.status,
      })),
      rules,
    );

    const nameById = new Map(teamRows.map((t) => [t.id, t.name]));
    const results = gameRows
      .filter((g) => g.status === "completed" && g.homeScore != null && g.awayScore != null && g.homeTeamId && g.awayTeamId)
      .sort((a, b) => new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime())
      .map((g) => ({
        id: g.id,
        playedAt: g.scheduledAt,
        homeTeam: nameById.get(g.homeTeamId as string) ?? "TBD",
        awayTeam: nameById.get(g.awayTeamId as string) ?? "TBD",
        homeScore: g.homeScore,
        awayScore: g.awayScore,
      }));

    return json({
      season: { id: row.season.id, name: row.season.name, status: row.season.status, startDate: row.season.startDate },
      rules: { allowDraws: rules.allowDraws },
      standings,
      results,
    });
  } catch (err) {
    console.error("league-standings error:", err);
    return json(empty);
  }
};
