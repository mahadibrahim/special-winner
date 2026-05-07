/**
 * PATCH /api/admin/venues/:id/role-assignments/:assignmentId
 *
 * Ends an active assignment by setting `effective_to = now`. No body required.
 *
 * Tenant scoping: assignment.organization_id must match caller's org. Venue
 * ownership is also checked (defense in depth — the URL nests assignment
 * under venue).
 */
import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { and, eq, isNull } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const venueId = context.params.id;
  const assignmentId = context.params.assignmentId;
  if (!venueId || !assignmentId) {
    return json({ error: "venue id and assignment id required" }, 400);
  }

  const venueCheck = await requireSameOrgVenue(orgContext.organizationId, venueId);
  if (!venueCheck.ok) return ownershipDeniedResponse();

  const db = getDb();

  const [existing] = await db
    .select()
    .from(venueRoleAssignments)
    .where(eq(venueRoleAssignments.id, assignmentId))
    .limit(1);

  if (!existing) return json({ error: "Not found" }, 404);
  // Cross-tenant lookups are conflated with not-found to avoid leaking existence.
  if (existing.organizationId !== orgContext.organizationId) {
    return json({ error: "Not found" }, 404);
  }
  if (existing.venueId !== venueId) {
    return json({ error: "Assignment does not belong to this venue" }, 404);
  }
  if (existing.effectiveTo !== null) {
    return json({ error: "Assignment already ended" }, 409);
  }

  const [updated] = await db
    .update(venueRoleAssignments)
    .set({ effectiveTo: new Date() })
    .where(
      and(
        eq(venueRoleAssignments.id, assignmentId),
        isNull(venueRoleAssignments.effectiveTo),
      ),
    )
    .returning();

  if (!updated) {
    // Lost race: someone ended it between our SELECT and UPDATE.
    return json({ error: "Assignment already ended" }, 409);
  }

  return json({ assignment: updated }, 200);
};
