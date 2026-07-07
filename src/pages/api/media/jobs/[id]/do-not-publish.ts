import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import {
  requireMediaStaffAccess,
  loadAssignedSession,
} from "@/lib/media/permissions";
import { getDoNotPublishForOrg } from "@/lib/consents/do-not-publish";

/**
 * GET /api/media/jobs/:id/do-not-publish
 *
 * The photographer/editor "do not feature these people" reference list
 * (product-backlog build #3) — the org's active individual opt-outs,
 * surfaced on the assigned shoot job so staff can avoid featuring an
 * opted-out person while shooting/culling/tagging. This is a reference
 * list, not a session-specific roster filter — it's the same list an
 * admin sees via GET /api/admin/compliance/family-members, scoped to the
 * job's organization.
 */
export const GET: APIRoute = async (context) => {
  const guard = await requireMediaStaffAccess(context);
  if (!guard.authorized) return guard.response;

  const id = context.params.id!;
  const session = await loadAssignedSession(guard.userId, id);
  if (!session) {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const doNotPublish = await getDoNotPublishForOrg(getDb(), session.organizationId);

  return new Response(JSON.stringify({ doNotPublish }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
