import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions, mediaAssets } from "@/lib/db/schema/media";
import { games, teams } from "@/lib/db/schema";
import { and, asc, eq, sql } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgCtx = await requireOrganizationContext(context);
  if (!orgCtx.hasOrganization) return orgCtx.response;

  const db = getDb();

  const rows = await db
    .select({
      session_id: shootSessions.id,
      game_id: shootSessions.gameId,
      session_type: shootSessions.sessionType,
      scheduled_start: shootSessions.scheduledStart,
      status: shootSessions.status,
      updated_at: shootSessions.updatedAt,
    })
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.organizationId, orgCtx.organizationId),
        eq(shootSessions.status, "uploaded")
      )
    )
    .orderBy(asc(shootSessions.updatedAt));

  const queue = await Promise.all(
    rows.map(async (r) => {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(mediaAssets)
        .where(eq(mediaAssets.shootSessionId, r.session_id));

      let game: {
        id: string;
        home: string | null;
        away: string | null;
        scheduled_at: Date;
      } | null = null;
      if (r.game_id) {
        const g = await db
          .select({
            id: games.id,
            scheduled_at: games.scheduledAt,
            home_team_id: games.homeTeamId,
            away_team_id: games.awayTeamId,
          })
          .from(games)
          .where(eq(games.id, r.game_id))
          .limit(1);
        if (g[0]) {
          const [homeT, awayT] = await Promise.all([
            g[0].home_team_id
              ? db
                  .select({ name: teams.name })
                  .from(teams)
                  .where(eq(teams.id, g[0].home_team_id))
                  .limit(1)
              : Promise.resolve([] as { name: string }[]),
            g[0].away_team_id
              ? db
                  .select({ name: teams.name })
                  .from(teams)
                  .where(eq(teams.id, g[0].away_team_id))
                  .limit(1)
              : Promise.resolve([] as { name: string }[]),
          ]);
          game = {
            id: g[0].id,
            home: homeT[0]?.name ?? null,
            away: awayT[0]?.name ?? null,
            scheduled_at: g[0].scheduled_at,
          };
        }
      }

      return {
        session_id: r.session_id,
        session_type: r.session_type,
        scheduled_start: r.scheduled_start,
        uploaded_at: r.updated_at,
        asset_count: count,
        game,
      };
    })
  );

  return new Response(JSON.stringify({ queue }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
