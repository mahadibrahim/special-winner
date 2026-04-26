import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions, mediaAssets } from "@/lib/db/schema/media";
import { games, teams } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgCtx = await requireOrganizationContext(context);
  if (!orgCtx.hasOrganization) return orgCtx.response;

  const db = getDb();

  // Single aggregating JOIN — replaces an N+1 walk that did one count, one
  // game lookup, and two team lookups per queued session. With CI's shared
  // DB carrying hundreds of accumulated 'uploaded' sessions and postgres-js
  // pinned to max:1, the previous shape would saturate the test-api worker
  // for tens of seconds. The teams table is aliased twice for home/away.
  const homeTeams = alias(teams, "home_teams");
  const awayTeams = alias(teams, "away_teams");

  const rows = await db
    .select({
      session_id: shootSessions.id,
      session_type: shootSessions.sessionType,
      scheduled_start: shootSessions.scheduledStart,
      updated_at: shootSessions.updatedAt,
      asset_count: sql<number>`count(${mediaAssets.id})::int`,
      g_id: games.id,
      g_scheduled_at: games.scheduledAt,
      home_team_name: homeTeams.name,
      away_team_name: awayTeams.name,
    })
    .from(shootSessions)
    .leftJoin(mediaAssets, eq(mediaAssets.shootSessionId, shootSessions.id))
    .leftJoin(games, eq(games.id, shootSessions.gameId))
    .leftJoin(homeTeams, eq(homeTeams.id, games.homeTeamId))
    .leftJoin(awayTeams, eq(awayTeams.id, games.awayTeamId))
    .where(
      and(
        eq(shootSessions.organizationId, orgCtx.organizationId),
        eq(shootSessions.status, "uploaded")
      )
    )
    .groupBy(shootSessions.id, games.id, homeTeams.id, awayTeams.id)
    .orderBy(asc(shootSessions.updatedAt));

  const queue = rows.map((r) => ({
    session_id: r.session_id,
    session_type: r.session_type,
    scheduled_start: r.scheduled_start,
    uploaded_at: r.updated_at,
    asset_count: r.asset_count,
    game: r.g_id
      ? {
          id: r.g_id,
          home: r.home_team_name,
          away: r.away_team_name,
          scheduled_at: r.g_scheduled_at,
        }
      : null,
  }));

  return new Response(JSON.stringify({ queue }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
