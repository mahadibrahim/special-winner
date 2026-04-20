import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { mediaAssets, shootSessions } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
  requireMediaStaffAccess,
  loadAssignedSession,
} from "@/lib/media/permissions";
import * as r2 from "@/lib/storage/r2";
import { logMediaAction } from "@/lib/media/audit";

const schema = z.object({
  uploadId: z.string().min(1),
  parts: z
    .array(
      z.object({
        ETag: z.string().min(1),
        PartNumber: z.number().int().min(1),
      })
    )
    .min(1),
});

export const POST: APIRoute = async (context) => {
  const guard = await requireMediaStaffAccess(context);
  if (!guard.authorized) return guard.response;

  const sessionId = context.params.id!;
  const assetId = context.params.asset!;

  const session = await loadAssignedSession(guard.userId, sessionId);
  if (!session)
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });

  const body = await context.request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      }),
      { status: 400 }
    );
  }

  const db = getDb();
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(eq(mediaAssets.id, assetId), eq(mediaAssets.shootSessionId, sessionId))
    )
    .limit(1);
  if (!asset)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  if (process.env.R2_MOCK !== "1") {
    await r2.completeMultipartUpload(
      asset.storageKey,
      parsed.data.uploadId,
      parsed.data.parts
    );
  }

  const [updated] = await db
    .update(mediaAssets)
    .set({
      status: "uploaded",
      uploadedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(mediaAssets.id, assetId))
    .returning();

  await logMediaAction({
    actorUserId: guard.userId,
    entityType: "asset",
    entityId: assetId,
    action: "update",
    diff: { status: "uploaded" },
  });

  // Fire-and-forget thumbnail job trigger (Netlify background function).
  // Exact invocation mechanism depends on deployment; call the internal
  // endpoint and ignore the result.
  const triggerUrl = `${process.env.PUBLIC_APP_URL || "http://localhost:4321"}/api/jobs/media-thumbnail`;
  fetch(triggerUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.INTERNAL_JOB_SECRET ?? ""}`,
    },
    body: JSON.stringify({ assetId }),
  }).catch(() => {});

  // If every asset in session is now 'uploaded', flip session to 'uploaded'
  // and fire admin notification.
  const remaining = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.shootSessionId, sessionId),
        eq(mediaAssets.status, "uploading")
      )
    )
    .limit(1);

  if (remaining.length === 0) {
    await db
      .update(shootSessions)
      .set({ status: "uploaded", updatedAt: new Date() })
      .where(eq(shootSessions.id, sessionId));
  }

  return new Response(JSON.stringify({ asset: updated }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
