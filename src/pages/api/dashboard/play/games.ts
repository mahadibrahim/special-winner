import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { games, teams, venues } from "@/lib/db/schema/teams";
import { and, or, gte, inArray, asc } from "drizzle-orm";
import { getPlayerTeamIds } from "@/lib/dashboard/play-teams";

export const prerender = false;

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }
  const db = getDb();
  const teamIds = await getPlayerTeamIds(locals.user.id);
  if (teamIds.length === 0) return json({ games: [] });

  // No status filter: cancelled/postponed games with a future scheduledAt are
  // included — the UI should branch on game.status.
  const upcoming = await db
    .select({
      id: games.id,
      scheduledAt: games.scheduledAt,
      status: games.status,
      homeTeamId: games.homeTeamId,
      awayTeamId: games.awayTeamId,
      venueId: games.venueId,
      fieldNumber: games.fieldNumber,
    })
    .from(games)
    .where(
      and(
        gte(games.scheduledAt, new Date()),
        or(inArray(games.homeTeamId, teamIds), inArray(games.awayTeamId, teamIds)),
      ),
    )
    .orderBy(asc(games.scheduledAt))
    .limit(20);

  // Collect all opponent team ids in one pass to avoid N+1
  const opponentTeamIds = upcoming.flatMap((g) => {
    // homeTeamId/awayTeamId are nullable (team deleted, or fixture still TBD).
    // A null home slot yields isHome=false and opponentName=null — UI should treat
    // isHome=false as "not confirmed home", not "confirmed away".
    const isHome = g.homeTeamId !== null && teamIds.includes(g.homeTeamId);
    const opponentId = isHome ? g.awayTeamId : g.homeTeamId;
    return opponentId ? [opponentId] : [];
  });
  const uniqueOpponentIds = [...new Set(opponentTeamIds)];

  const teamNameMap = new Map<string, string>();
  if (uniqueOpponentIds.length > 0) {
    const teamRows = await db
      .select({ id: teams.id, name: teams.name })
      .from(teams)
      .where(inArray(teams.id, uniqueOpponentIds));
    for (const t of teamRows) teamNameMap.set(t.id, t.name);
  }

  // Collect venue ids → fetch name + address in one query (N+1-safe).
  const venueIds = [...new Set(upcoming.map((g) => g.venueId).filter((v): v is string => v !== null))];
  const venueMap = new Map<string, { name: string; address: string | null }>();
  if (venueIds.length > 0) {
    const venueRows = await db
      .select({ id: venues.id, name: venues.name, address: venues.address })
      .from(venues)
      .where(inArray(venues.id, venueIds));
    for (const v of venueRows) venueMap.set(v.id, { name: v.name, address: v.address });
  }

  const result = upcoming.map((g) => {
    const isHome = g.homeTeamId !== null && teamIds.includes(g.homeTeamId);
    const opponentId = isHome ? g.awayTeamId : g.homeTeamId;
    const opponentName = opponentId ? (teamNameMap.get(opponentId) ?? null) : null;
    const venue = g.venueId ? venueMap.get(g.venueId) : undefined;
    return {
      ...g,
      isHome,
      opponentName,
      venueName: venue?.name ?? null,
      venueAddress: venue?.address ?? null,
    };
  });

  return json({ games: result });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
