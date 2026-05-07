/**
 * POST /api/admin/activity-completions/:id/reassign
 *
 * Reassigns the activity to a different role. Updates
 * `current_responsible_role` and appends an entry to `responsible_history`.
 * Does NOT touch status — the activity remains pending/in_progress/overdue.
 *
 * Body: { role: string, reason: string }
 *
 * The new role is taken on faith — we don't validate it against the
 * catalog's role list here, since custom escalations may need an
 * arbitrary role string. The catalog validator covers role refs at
 * authoring time.
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

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const id = context.params.id;
  if (!id) return json({ error: "id required" }, 400);

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const role = typeof body?.role === "string" ? body.role.trim() : "";
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!role || !reason) {
    return json({ error: "role + reason required" }, 400);
  }

  const db = getDb();
  const [row] = await db
    .select()
    .from(activityCompletions)
    .where(eq(activityCompletions.id, id))
    .limit(1);
  if (!row) return json({ error: "Not found" }, 404);
  if (row.organizationId !== orgContext.organizationId) {
    return json({ error: "Not found" }, 404);
  }
  if (row.status === "completed" || row.status === "canceled" || row.status === "skipped_by_handoff") {
    return json({ error: `Cannot reassign a ${row.status} completion` }, 409);
  }

  const history = Array.isArray(row.responsibleHistory)
    ? (row.responsibleHistory as any[])
    : [];
  const newHistory = [
    ...history,
    {
      role,
      assigned_at: new Date().toISOString(),
      reason: `manual reassign by user ${auth.user.id}: ${reason}`,
    },
  ];

  const [updated] = await db
    .update(activityCompletions)
    .set({
      currentResponsibleRole: role,
      responsibleHistory: newHistory,
      updatedAt: new Date(),
    })
    .where(eq(activityCompletions.id, id))
    .returning();

  return json(updated, 200);
};
