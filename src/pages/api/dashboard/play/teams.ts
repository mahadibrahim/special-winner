import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { teams, standings } from "@/lib/db/schema/teams";
import { inArray } from "drizzle-orm";
import { getPlayerTeamIds } from "@/lib/dashboard/play-teams";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  const teamIds = await getPlayerTeamIds(locals.user.id);
  if (teamIds.length === 0) return json({ teams: [] });

  const teamRows = await db
    .select({
      id: teams.id,
      name: teams.name,
      color: teams.color,
      seasonId: teams.seasonId,
      division: teams.division,
    })
    .from(teams)
    .where(inArray(teams.id, teamIds));

  const standingRows = await db
    .select({
      teamId: standings.teamId,
      wins: standings.wins,
      losses: standings.losses,
      ties: standings.ties,
    })
    .from(standings)
    .where(inArray(standings.teamId, teamIds));
  const standingByTeam = new Map(standingRows.map((s) => [s.teamId, s]));

  const result = teamRows.map((t) => {
    const s = standingByTeam.get(t.id);
    return {
      ...t,
      record: s
        ? { wins: s.wins, losses: s.losses, ties: s.ties }
        : { wins: 0, losses: 0, ties: 0 },
    };
  });
  return json({ teams: result });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
