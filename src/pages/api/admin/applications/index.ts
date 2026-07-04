import type { APIRoute } from "astro";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jobApplications } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const rows = await getDb()
    .select()
    .from(jobApplications)
    .where(eq(jobApplications.organizationId, auth.organizationId))
    .orderBy(desc(jobApplications.createdAt))
    .limit(200);

  return new Response(JSON.stringify({ applications: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
