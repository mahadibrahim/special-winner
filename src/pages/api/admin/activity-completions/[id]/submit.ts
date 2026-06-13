/**
 * POST /api/admin/activity-completions/:id/submit
 *
 * Single submit endpoint that branches on the activity's tracking_method
 * and writes the appropriate evidence row before flipping the completion
 * to `completed`.
 *
 * Body shape varies by method:
 *   - checklist:    { items: [{ item_id, checked, note? }, ...] }
 *   - form:         { fields: { <field_id>: <value>, ... } }
 *   - signature:    { typed_name: string }
 *   - photo_upload: { media_id: uuid }
 *
 * The completion → completed flip uses a status-conditional UPDATE so two
 * concurrent submits can't both win. The loser gets a 409.
 *
 * Tenant scoping: activity_completions.organization_id is the snapshot —
 * we check it against the resolved org context directly. Cross-tenant
 * lookups are conflated with not-found.
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  activityCompletions,
  checklistSubmissions,
  formSubmissions,
  signatureSubmissions,
} from "@/lib/db/schema/activity-tracking";
import { games } from "@/lib/db/schema/teams";
import { eq, and, ne } from "drizzle-orm";
import { requireSuperAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { getActivityFromCatalog } from "@/lib/activity-tracking/catalog-cache";
import { userHoldsVenueRole } from "@/lib/activity-tracking/venue-roles";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireSuperAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const completionId = context.params.id;
  if (!completionId) return json({ error: "id required" }, 400);

  let body: any;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
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
  if (completion.status === "completed") {
    return json({ error: "Already completed" }, 409);
  }
  if (completion.status === "canceled" || completion.status === "skipped_by_handoff") {
    return json({ error: `Completion is ${completion.status}` }, 409);
  }

  const activity = await getActivityFromCatalog(completion.activityId);
  if (!activity) {
    return json({ error: "Activity not in catalog" }, 410);
  }

  // Build the evidence FK to set on the completion row alongside `status =
  // completed`. Only one of the four FKs is non-null per row.
  const evidenceFKs: Partial<typeof activityCompletions.$inferInsert> = {};

  if (activity.tracking_method === "checklist") {
    if (!Array.isArray(body?.items)) {
      return json({ error: "items required" }, 400);
    }
    const templateId = (activity.tracking_artifact as any)?.template_id;
    if (!templateId) return json({ error: "Missing template_id" }, 500);

    const [sub] = await db
      .insert(checklistSubmissions)
      .values({
        completionId,
        templateId,
        submittedByUserId: auth.user.id,
        items: body.items,
      })
      .returning();
    evidenceFKs.checklistSubmissionId = sub.id;
  } else if (activity.tracking_method === "form") {
    if (!body?.fields || typeof body.fields !== "object") {
      return json({ error: "fields required" }, 400);
    }
    const templateId = (activity.tracking_artifact as any)?.template_id;
    if (!templateId) return json({ error: "Missing template_id" }, 500);

    const [sub] = await db
      .insert(formSubmissions)
      .values({
        completionId,
        templateId,
        submittedByUserId: auth.user.id,
        fields: body.fields,
      })
      .returning();
    evidenceFKs.formSubmissionId = sub.id;
  } else if (activity.tracking_method === "signature") {
    const typedName = typeof body?.typed_name === "string" ? body.typed_name.trim() : "";
    if (typedName.length < 3) {
      return json({ error: "typed_name required (min 3 chars)" }, 400);
    }
    const templateId = (activity.tracking_artifact as any)?.template_id;
    const requiredRole = (activity.tracking_artifact as any)?.required_role;
    if (!templateId || !requiredRole) {
      return json({ error: "Missing template_id or required_role" }, 500);
    }

    // A signature attests that the signer holds `requiredRole` at the game's
    // venue. Verify it against venue_role_assignments before recording the
    // signature — otherwise any caller past the (super-admin) auth gate could
    // mint a role-attested signature for a role/venue they don't actually
    // hold (ISS-5). Resolve the venue from the completion's game.
    const [game] = await db
      .select({ venueId: games.venueId })
      .from(games)
      .where(eq(games.id, completion.gameId))
      .limit(1);
    if (!game?.venueId) {
      return json(
        { error: "Activity has no venue; signing role cannot be verified" },
        409,
      );
    }
    const holdsRole = await userHoldsVenueRole(
      game.venueId,
      requiredRole,
      auth.user.id,
    );
    if (!holdsRole) {
      return json(
        {
          error:
            "You do not hold the required role at this venue to sign off this activity",
        },
        403,
      );
    }

    const [sub] = await db
      .insert(signatureSubmissions)
      .values({
        completionId,
        templateId,
        signedByUserId: auth.user.id,
        typedName,
        signedRole: requiredRole,
      })
      .returning();
    evidenceFKs.signatureSubmissionId = sub.id;
  } else if (activity.tracking_method === "photo_upload") {
    if (!body?.media_id || typeof body.media_id !== "string") {
      return json({ error: "media_id required" }, 400);
    }
    evidenceFKs.photoId = body.media_id;
  } else {
    return json(
      {
        error: `Cannot submit method '${activity.tracking_method}' via this endpoint. Use the appropriate auto-complete path.`,
      },
      400,
    );
  }

  // Status-conditional flip: only update if still pending/in_progress/overdue.
  const updated = await db
    .update(activityCompletions)
    .set({
      status: "completed",
      completedAt: new Date(),
      completedByUserId: auth.user.id,
      ...evidenceFKs,
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
