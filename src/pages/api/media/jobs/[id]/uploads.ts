import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions, mediaAssets } from "@/lib/db/schema/media";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import {
  requireMediaStaffAccess,
  loadAssignedSession,
} from "@/lib/media/permissions";
import * as r2 from "@/lib/storage/r2";
import { originalKey } from "@/lib/storage/keys";

const schema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1),
        contentType: z.string().min(1),
        sizeBytes: z.number().int().nonnegative(),
        partCount: z.number().int().min(1).max(10000),
      })
    )
    .min(1)
    .max(500),
});

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1) : "";
}

async function issueUrls(
  key: string,
  contentType: string,
  partCount: number
): Promise<{ uploadId: string; partUrls: string[] }> {
  if (process.env.R2_MOCK === "1") {
    const uploadId = `mock-${randomUUID()}`;
    return {
      uploadId,
      partUrls: Array.from(
        { length: partCount },
        (_, i) => `http://mock-r2.local/${key}?partNumber=${i + 1}&uploadId=${uploadId}`
      ),
    };
  }
  const { uploadId } = await r2.createMultipartUpload(key, contentType);
  const partUrls = await r2.getSignedPartUrls(key, uploadId, partCount);
  return { uploadId, partUrls };
}

export const POST: APIRoute = async (context) => {
  const guard = await requireMediaStaffAccess(context);
  if (!guard.authorized) return guard.response;

  const id = context.params.id!;
  const session = await loadAssignedSession(guard.userId, id);
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
  const [sessionRow] = await db
    .select({ organizationId: shootSessions.organizationId })
    .from(shootSessions)
    .where(eq(shootSessions.id, id))
    .limit(1);
  if (!sessionRow)
    return new Response(JSON.stringify({ error: "Not found" }), { status: 404 });

  // Flip session to 'uploading' if still 'checked_in'/'confirmed'/'assigned'.
  await db
    .update(shootSessions)
    .set({ status: "uploading", updatedAt: new Date() })
    .where(eq(shootSessions.id, id));

  const uploads: Array<{
    assetId: string;
    uploadId: string;
    storageKey: string;
    partUrls: string[];
  }> = [];

  for (const f of parsed.data.files) {
    const assetId = randomUUID();
    const key = originalKey(
      sessionRow.organizationId,
      id,
      assetId,
      extOf(f.filename)
    );
    const { uploadId, partUrls } = await issueUrls(key, f.contentType, f.partCount);
    await db.insert(mediaAssets).values({
      id: assetId,
      shootSessionId: id,
      organizationId: sessionRow.organizationId,
      assetType: f.contentType.startsWith("video/") ? "video" : "photo",
      storageKey: key,
      originalFilename: f.filename,
      fileSizeBytes: f.sizeBytes,
      mimeType: f.contentType,
      multipartUploadId: uploadId,
      status: "uploading",
    });
    uploads.push({ assetId, uploadId, storageKey: key, partUrls });
  }

  return new Response(JSON.stringify({ uploads }), {
    status: 201,
    headers: { "Content-Type": "application/json" },
  });
};
