/**
 * POST /api/admin/activity-completions/:id/mark-photo-out-of-band
 *
 * Marks a photo_upload activity as completed WITHOUT writing a media_id
 * evidence row. Records a note in responsibleHistory so the manual
 * override is auditable.
 *
 * TODO(plan-4): This endpoint exists because the media schema is not yet
 * ready to associate uploaded assets with an activity_completion. The
 * `mediaAssets` table has no `gameId` or `kind`/`media_kind` column today
 * (Phase D errata). Once the per-feature plans add a media_kind column
 * and tie shoot sessions / mediaAssets to activity completions, this
 * endpoint can be deleted in favor of the real photo-selection submit
 * path on /api/admin/activity-completions/[id]/submit.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { activityCompletions } from "@/lib/db/schema/activity-tracking";
import { and, eq, ne } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { getActivityFromCatalog } from "@/lib/activity-tracking/catalog-cache";

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

  const completionId = context.params.id;
  if (!completionId) return json({ error: "id required" }, 400);

  let body: any = {};
  try {
    body = await context.request.json();
  } catch {
    // body is optional; tolerate empty
  }

  const db = getDb();
  const [completion] = await db
    .select()
    .from(activityCompletions)
    .where(eq(activityCompletions.id, completionId))
    .limit(1);

  if (!completion) return json({ error: "Not found" }, 404);
  if (completion.organizationId !== orgContext.organizationId) {
    return json({ error: "Not found" }, 404);
  }

  const activity = await getActivityFromCatalog(completion.activityId);
  if (!activity) return json({ error: "Activity not in catalog" }, 410);
  if (activity.tracking_method !== "photo_upload") {
    return json(
      {
        error: `mark-photo-out-of-band only valid for photo_upload activities (got ${activity.tracking_method})`,
      },
      400,
    );
  }
  if (completion.status === "completed") {
    return json({ error: "Already completed" }, 409);
  }

  // Append an audit entry to responsibleHistory.
  const note = typeof body?.note === "string" ? body.note.trim() : "";
  const history = Array.isArray(completion.responsibleHistory)
    ? (completion.responsibleHistory as any[])
    : [];
  const newHistory = [
    ...history,
    {
      role: completion.currentResponsibleRole,
      assigned_at: new Date().toISOString(),
      reason: `manual_override:photo_out_of_band by user ${auth.user.id}${
        note ? ` — ${note}` : ""
      }`,
    },
  ];

  const updated = await db
    .update(activityCompletions)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedByUserId: auth.user.id,
      responsibleHistory: newHistory,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(activityCompletions.id, completionId),
        ne(activityCompletions.status, "completed"),
        ne(activityCompletions.status, "canceled"),
        ne(activityCompletions.status, "skipped_by_handoff"),
      ),
    )
    .returning();

  if (updated.length === 0) {
    return json({ error: "Already completed (race)" }, 409);
  }
  return json(updated[0], 200);
};
