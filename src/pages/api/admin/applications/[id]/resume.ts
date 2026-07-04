import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getSignedGetUrl } from "@/lib/storage/r2";

export const prerender = false;

/**
 * 302s to a fresh signed R2 URL for the application's resume. This is the
 * stable URL the Notion "Resume" property links to — signed URLs expire,
 * this endpoint never does (and enforces admin + tenant scope).
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const [row] = await getDb()
    .select({ resumeKey: jobApplications.resumeKey })
    .from(jobApplications)
    .where(
      and(
        eq(jobApplications.id, id),
        eq(jobApplications.organizationId, auth.organizationId)
      )
    )
    .limit(1);
  if (!row?.resumeKey) {
    return new Response(
      JSON.stringify({ error: "No resume on this application" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
  const url = await getSignedGetUrl(row.resumeKey);
  return context.redirect(url, 302);
};
