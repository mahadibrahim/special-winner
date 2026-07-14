import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema/job-applications";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

const COLUMN_BY_KIND = {
  photo: "photoKey",
  motivation: "motivationVideoKey",
  demo: "demoVideoKey",
} as const;

/**
 * GET /api/admin/applications/:id/media/:kind → 302 to a fresh signed R2 URL.
 *
 * `kind` selects which host-application media column to serve (photo,
 * motivation video, demo video). Mirrors resume.ts's mock/redirect handling.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const { id, kind } = context.params;
  const column = COLUMN_BY_KIND[kind as keyof typeof COLUMN_BY_KIND];
  if (!id || !column) {
    return new Response(JSON.stringify({ error: "Unknown media kind" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [row] = await getDb()
    .select({
      photoKey: jobApplications.photoKey,
      motivationVideoKey: jobApplications.motivationVideoKey,
      demoVideoKey: jobApplications.demoVideoKey,
    })
    .from(jobApplications)
    .where(
      and(eq(jobApplications.id, id), eq(jobApplications.organizationId, auth.organizationId)),
    )
    .orderBy(asc(jobApplications.createdAt))
    .limit(1);
  const key = row?.[column];
  if (!key) {
    return new Response(JSON.stringify({ error: "No media on this application" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  // Link-mode applications (no-R2 degrade path) store a full URL — pass through.
  if (key.startsWith("https://")) {
    return context.redirect(key, 302);
  }
  // R2_MOCK: mirror resume.ts — return a deterministic mock URL instead of
  // signing (getSignedGetUrl needs real R2 env and would 500 in CI).
  if (process.env.R2_MOCK === "1") {
    return context.redirect(`https://mock-r2.local/${key}`, 302);
  }
  const url = await getSignedGetUrl(key);
  return context.redirect(url, 302);
};
