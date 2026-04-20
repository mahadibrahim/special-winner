import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaAssets, mediaTags, shootSessions } from "@/lib/db/schema/media";
import { eq, asc } from "drizzle-orm";
import { validateSession } from "@/lib/auth/session";
import { canTagSession } from "@/lib/media/tag-permissions";
import { getTaggerRoster } from "@/lib/media/roster-subset";
import { getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

async function resolveUrl(key: string, ttl: number): Promise<string> {
  if (process.env.R2_MOCK === "1") {
    return `https://mock-r2.local/${key}?ttl=${ttl}`;
  }
  return getSignedGetUrl(key, ttl);
}

export const GET: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sessionId = context.params.session_id;
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing session_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const perm = await canTagSession(user.id, sessionId);
  if (!perm.allowed) {
    return new Response(JSON.stringify({ error: perm.reason }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();
  const session = await db.query.shootSessions.findFirst({
    where: eq(shootSessions.id, sessionId),
  });
  if (!session) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const assetRows = await db
    .select({
      id: mediaAssets.id,
      storageKey: mediaAssets.storageKey,
      thumbnailKey: mediaAssets.thumbnailKey,
      capturedAt: mediaAssets.capturedAt,
      burstGroupId: mediaAssets.burstGroupId,
      status: mediaAssets.status,
      width: mediaAssets.width,
      height: mediaAssets.height,
    })
    .from(mediaAssets)
    .where(eq(mediaAssets.shootSessionId, sessionId))
    .orderBy(asc(mediaAssets.capturedAt), asc(mediaAssets.id));

  const existingTags = await db
    .select()
    .from(mediaTags)
    .innerJoin(mediaAssets, eq(mediaTags.mediaAssetId, mediaAssets.id))
    .where(eq(mediaAssets.shootSessionId, sessionId));

  const assets = await Promise.all(
    assetRows.map(async (a) => ({
      id: a.id,
      captured_at: a.capturedAt,
      burst_group_id: a.burstGroupId,
      status: a.status,
      width: a.width,
      height: a.height,
      thumbnail_url: a.thumbnailKey ? await resolveUrl(a.thumbnailKey, 600) : null,
      preview_url: await resolveUrl(a.storageKey, 600),
      tags: existingTags
        .filter((t) => t.media_tags.mediaAssetId === a.id)
        .map((t) => ({
          id: t.media_tags.id,
          family_member_id: t.media_tags.familyMemberId,
          team_id: t.media_tags.teamId,
          tag_scope: t.media_tags.tagScope,
          source: t.media_tags.source,
        })),
    }))
  );

  const roster = await getTaggerRoster(sessionId);

  return new Response(
    JSON.stringify({
      session: {
        id: session.id,
        status: session.status,
        game_id: session.gameId,
      },
      assets,
      roster,
    }),
    { status: 200, headers: { "Content-Type": "application/json" } }
  );
};
