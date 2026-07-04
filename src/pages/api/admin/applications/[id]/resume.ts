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
  // R2_MOCK: mirror /api/media/tag — return a deterministic mock URL instead
  // of signing (getSignedGetUrl needs real R2 env and would 500 in CI).
  if (process.env.R2_MOCK === "1") {
    return context.redirect(`https://mock-r2.local/${row.resumeKey}`, 302);
  }
  const url = await getSignedGetUrl(row.resumeKey);
  return context.redirect(url, 302);
};
