/**
 * GET /api/admin/incidents/[id]
 *
 * Incident detail. Tenant-pinned via requireSameOrgIncident; location_admin
 * additionally must cover the incident's venue (via getLocationIdsForUser),
 * same 404-not-403 convention as every other requireSameOrg* helper (don't
 * leak existence of a cross-scope row).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venues } from "@/lib/db/schema/teams";
import { familyMembers } from "@/lib/db/schema/registrations";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireSameOrgIncident,
  requireSameLocation,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) {
    return new Response(JSON.stringify({ error: "Incident ID is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const incidentCheck = await requireSameOrgIncident(auth.organizationId, id);
  if (!incidentCheck.ok) return ownershipDeniedResponse();
  const incident = incidentCheck.row;

  const [venue] = await getDb()
    .select({ id: venues.id, name: venues.name, locationId: venues.locationId })
    .from(venues)
    .where(eq(venues.id, incident.venueId))
    .limit(1);

  const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
  if (!isSuperAdmin) {
    const allowedLocationIds = await getLocationIdsForUser(auth.user.id);
    const locationCheck = requireSameLocation(allowedLocationIds, venue?.locationId ?? "");
    if (!locationCheck.ok) return ownershipDeniedResponse();
  }

  let subject: { firstName: string; lastName: string } | null = null;
  if (incident.subjectFamilyMemberId) {
    const [member] = await getDb()
      .select({ firstName: familyMembers.firstName, lastName: familyMembers.lastName })
      .from(familyMembers)
      .where(eq(familyMembers.id, incident.subjectFamilyMemberId))
      .limit(1);
    subject = member ?? null;
  }

  return new Response(
    JSON.stringify({
      incident: {
        ...incident,
        venueName: venue?.name ?? null,
        subjectFirstName: subject?.firstName ?? null,
        subjectLastName: subject?.lastName ?? null,
      },
    }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
};
