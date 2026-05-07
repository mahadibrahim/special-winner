/**
 * POST /api/admin/activity-completions/:id/cancel
 *
 * Cancels a single activity completion (vs. cancelActivityCompletions in
 * the lifecycle module which cancels every completion for a game). Used
 * when an admin wants to drop a single activity that no longer applies
 * — e.g. concessions activity bootstrapped before someone toggled the
 * venue.concessions flag off for the day.
 *
 * Body: { reason: string }  (required, recorded in responsibleHistory)
 *
 * Tenant scoping via the org snapshot on the row.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, ne } from "drizzle-orm";
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
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!reason) return json({ error: "reason required" }, 400);

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
  if (row.status === "completed") {
    return json({ error: "Already completed" }, 409);
  }
  if (row.status === "canceled") {
    return json({ error: "Already canceled" }, 409);
  }

  const history = Array.isArray(row.responsibleHistory)
    ? (row.responsibleHistory as any[])
    : [];
  const newHistory = [
    ...history,
    {
      role: row.currentResponsibleRole,
      assigned_at: new Date().toISOString(),
      reason: `canceled by user ${auth.user.id}: ${reason}`,
    },
  ];

  const updated = await db
    .update(activityCompletions)
    .set({
      status: "canceled",
      responsibleHistory: newHistory,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(activityCompletions.id, id),
        ne(activityCompletions.status, "completed"),
        ne(activityCompletions.status, "canceled"),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return json({ error: "Status changed (race)" }, 409);
  }

  return json(updated[0], 200);
};
