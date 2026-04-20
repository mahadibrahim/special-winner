import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaAssets, mediaTags } from "@/lib/db/schema/media";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { validateSession } from "@/lib/auth/session";
import { canTagSession } from "@/lib/media/tag-permissions";
import { logMediaAction } from "@/lib/media/audit";

export const prerender = false;

const bodySchema = z.object({
  tags: z
    .array(
      z.object({
        asset_id: z.string().uuid(),
        tag_scope: z.enum(["player", "team", "both_teams"]),
        family_member_id: z.string().uuid().optional().nullable(),
        team_id: z.string().uuid().optional().nullable(),
        source: z.enum([
          "manual_staff",
          "manual_offshore",
          "manual_admin",
          "auto_jersey_ocr",
          "auto_face",
          "burst_propagated",
        ]),
      })
    )
    .min(1)
    .max(100),
  propagate_to_burst: z.boolean().optional().default(false),
});

function validateScope(tag: {
  tag_scope: "player" | "team" | "both_teams";
  family_member_id?: string | null;
  team_id?: string | null;
}): string | null {
  if (tag.tag_scope === "player") {
    if (!tag.family_member_id) return "player scope requires family_member_id";
    if (tag.team_id) return "player scope must omit team_id";
  }
  if (tag.tag_scope === "team") {
    if (!tag.team_id) return "team scope requires team_id";
    if (tag.family_member_id) return "team scope must omit family_member_id";
  }
  if (tag.tag_scope === "both_teams") {
    if (tag.family_member_id || tag.team_id)
      return "both_teams scope must omit both ids";
  }
  return null;
}

export const POST: APIRoute = async (context) => {
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

  let parsed: z.infer<typeof bodySchema>;
  try {
    parsed = bodySchema.parse(await context.request.json());
  } catch (e) {
    return new Response(
      JSON.stringify({ error: "Invalid body", detail: String(e) }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  for (const t of parsed.tags) {
    const err = validateScope(t);
    if (err) {
      return new Response(JSON.stringify({ error: err }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const db = getDb();

  const assetIds = [...new Set(parsed.tags.map((t) => t.asset_id))];
  const assetRows = await db
    .select({
      id: mediaAssets.id,
      shootSessionId: mediaAssets.shootSessionId,
      burstGroupId: mediaAssets.burstGroupId,
    })
    .from(mediaAssets)
    .where(inArray(mediaAssets.id, assetIds));
  const byId = new Map(assetRows.map((a) => [a.id, a]));
  for (const id of assetIds) {
    const a = byId.get(id);
    if (!a || a.shootSessionId !== sessionId) {
      return new Response(
        JSON.stringify({ error: `Asset ${id} not in session` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }
  }

  type EnqueuedTag = (typeof parsed.tags)[number] & {
    effective_source: string;
  };
  const enqueued: EnqueuedTag[] = [];

  if (parsed.propagate_to_burst) {
    const leaderBursts = new Set(
      parsed.tags
        .map((t) => byId.get(t.asset_id)?.burstGroupId)
        .filter((g): g is string => !!g)
    );
    const burstMembers = leaderBursts.size
      ? await db
          .select({
            id: mediaAssets.id,
            burstGroupId: mediaAssets.burstGroupId,
          })
          .from(mediaAssets)
          .where(
            and(
              eq(mediaAssets.shootSessionId, sessionId),
              inArray(mediaAssets.burstGroupId, [...leaderBursts])
            )
          )
      : [];
    const byBurst = new Map<string, string[]>();
    for (const m of burstMembers) {
      if (!m.burstGroupId) continue;
      if (!byBurst.has(m.burstGroupId)) byBurst.set(m.burstGroupId, []);
      byBurst.get(m.burstGroupId)!.push(m.id);
    }

    for (const t of parsed.tags) {
      enqueued.push({ ...t, effective_source: t.source });
      const leader = byId.get(t.asset_id);
      if (!leader?.burstGroupId) continue;
      const siblings = (byBurst.get(leader.burstGroupId) ?? []).filter(
        (id) => id !== t.asset_id
      );
      for (const sib of siblings) {
        enqueued.push({
          ...t,
          asset_id: sib,
          effective_source: "burst_propagated",
        });
      }
    }
  } else {
    for (const t of parsed.tags) {
      enqueued.push({ ...t, effective_source: t.source });
    }
  }

  const created: Array<{
    id: string;
    media_asset_id: string;
    family_member_id: string | null;
    team_id: string | null;
    tag_scope: "player" | "team" | "both_teams";
    source: string;
  }> = [];
  const existing: Array<{
    id: string;
    media_asset_id: string;
    family_member_id: string | null;
    team_id: string | null;
    tag_scope: "player" | "team" | "both_teams";
    source: string;
  }> = [];

  for (const t of enqueued) {
    let whereClause;
    if (t.tag_scope === "player") {
      whereClause = and(
        eq(mediaTags.mediaAssetId, t.asset_id),
        eq(mediaTags.familyMemberId, t.family_member_id!)
      );
    } else if (t.tag_scope === "team") {
      whereClause = and(
        eq(mediaTags.mediaAssetId, t.asset_id),
        eq(mediaTags.teamId, t.team_id!),
        eq(mediaTags.tagScope, "team")
      );
    } else {
      whereClause = and(
        eq(mediaTags.mediaAssetId, t.asset_id),
        eq(mediaTags.tagScope, "both_teams")
      );
    }
    const hit = await db.select().from(mediaTags).where(whereClause).limit(1);
    if (hit.length > 0) {
      existing.push({
        id: hit[0].id,
        media_asset_id: hit[0].mediaAssetId,
        family_member_id: hit[0].familyMemberId,
        team_id: hit[0].teamId,
        tag_scope: hit[0].tagScope,
        source: hit[0].source,
      });
      continue;
    }

    const [row] = await db
      .insert(mediaTags)
      .values({
        mediaAssetId: t.asset_id,
        familyMemberId: t.family_member_id ?? null,
        teamId: t.team_id ?? null,
        tagScope: t.tag_scope,
        source: t.effective_source as
          | "manual_staff"
          | "manual_offshore"
          | "manual_admin"
          | "auto_jersey_ocr"
          | "auto_face"
          | "burst_propagated",
        confidence: "1.00",
        taggedByUserId: user.id,
      })
      .returning();
    created.push({
      id: row.id,
      media_asset_id: row.mediaAssetId,
      family_member_id: row.familyMemberId,
      team_id: row.teamId,
      tag_scope: row.tagScope,
      source: row.source,
    });

    await logMediaAction({
      actorUserId: user.id,
      entityType: "tag",
      entityId: row.id,
      action: "create",
      diff: {
        asset_id: row.mediaAssetId,
        family_member_id: row.familyMemberId,
        team_id: row.teamId,
        tag_scope: row.tagScope,
        source: row.source,
      },
    });
  }

  return new Response(JSON.stringify({ created, existing }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
