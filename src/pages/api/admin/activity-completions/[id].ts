/**
 * GET /api/admin/activity-completions/:id
 *
 * Returns a single activity completion row, scoped to the current org.
 *
 * Tenant scoping: `activity_completions.organization_id` is the snapshot
 * captured at bootstrap (per Phase D errata) — we check it directly
 * against the request's resolved org context.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const id = context.params.id;
  if (!id) return json({ error: "id required" }, 400);

  const [row] = await getDb()
    .select()
    .from(activityCompletions)
    .where(eq(activityCompletions.id, id))
    .limit(1);

  if (!row) return json({ error: "Not found" }, 404);

  // Cross-tenant lookups are conflated with not-found to avoid leaking existence.
  if (row.organizationId !== orgContext.organizationId) {
    return json({ error: "Not found" }, 404);
  }

  return json(row, 200);
};
