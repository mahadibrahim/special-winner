import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, standings } from "@/lib/db/schema/teams";
import { eq, inArray, desc, asc } from "drizzle-orm";
import { getPlayerTeamIds } from "@/lib/dashboard/play-teams";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  const teamIds = await getPlayerTeamIds(locals.user.id);
  if (teamIds.length === 0) return json({ standings: [] });

  // Step B: look up the season ids for those teams (one inArray query)
  const teamRows = await db
    .select({ id: teams.id, seasonId: teams.seasonId })
    .from(teams)
    .where(inArray(teams.id, teamIds));

  const seasonIds = [...new Set(teamRows.map((t) => t.seasonId))];
  if (seasonIds.length === 0) return json({ standings: [] });

  // Step C: select all standings for those seasons, joined to teams for the
  // team name. Returns the full division table (all teams), not just the
  // player's own team — so the UI can render a standings table.
  const rows = await db
    .select({
      seasonId: standings.seasonId,
      teamId: standings.teamId,
      teamName: teams.name,
      wins: standings.wins,
      losses: standings.losses,
      ties: standings.ties,
      gamesPlayed: standings.gamesPlayed,
    })
    .from(standings)
    .innerJoin(teams, eq(standings.teamId, teams.id))
    .where(inArray(standings.seasonId, seasonIds))
    .orderBy(desc(standings.wins), asc(standings.losses));

  return json({ standings: rows });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
