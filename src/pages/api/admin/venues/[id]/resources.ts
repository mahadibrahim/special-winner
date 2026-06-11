/**
 * GET /api/admin/venues/:id/resources — the venue's active top-level
 * fields (field-time ledger resources). Feeds field pickers (drop-in
 * session form, future game scheduling).
 */
import type { APIRoute } from "astro";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venueResources } from "@/lib/db/schema/scheduling";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { requireSameOrgVenue } from "@/lib/auth/require-resource-ownership";

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const venueId = context.params.id;
  if (!venueId) {
    return new Response(JSON.stringify({ error: "Venue id required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const owned = await requireSameOrgVenue(orgContext.organizationId, venueId);
  if (!owned.ok) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: owned.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rows = await getDb()
    .select({
      id: venueResources.id,
      name: venueResources.name,
      fieldNumber: venueResources.fieldNumber,
    })
    .from(venueResources)
    .where(
      and(
        eq(venueResources.venueId, venueId),
        isNull(venueResources.parentResourceId),
        eq(venueResources.active, true),
      ),
    )
    .orderBy(asc(venueResources.sortOrder));

  return new Response(JSON.stringify({ resources: rows }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
