import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaTags, mediaAssets } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth/session";
import { canTagSession } from "@/lib/media/tag-permissions";
import { logMediaAction } from "@/lib/media/audit";

export const prerender = false;

export const DELETE: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sessionId = context.params.session_id;
  const tagId = context.params.tag_id;
  if (!sessionId || !tagId) {
    return new Response(JSON.stringify({ error: "Missing params" }), {
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
  const [row] = await db
    .select({
      id: mediaTags.id,
      mediaAssetId: mediaTags.mediaAssetId,
      familyMemberId: mediaTags.familyMemberId,
      teamId: mediaTags.teamId,
      tagScope: mediaTags.tagScope,
      shootSessionId: mediaAssets.shootSessionId,
    })
    .from(mediaTags)
    .innerJoin(mediaAssets, eq(mediaTags.mediaAssetId, mediaAssets.id))
    .where(
      and(eq(mediaTags.id, tagId), eq(mediaAssets.shootSessionId, sessionId))
    );

  if (!row) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  await db.delete(mediaTags).where(eq(mediaTags.id, tagId));

  await logMediaAction({
    actorUserId: user.id,
    entityType: "tag",
    entityId: tagId,
    action: "delete",
    diff: {
      asset_id: row.mediaAssetId,
      family_member_id: row.familyMemberId,
      team_id: row.teamId,
      tag_scope: row.tagScope,
    },
  });

  return new Response(null, { status: 204 });
};
