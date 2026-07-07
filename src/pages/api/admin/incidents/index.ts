/**
 * GET /api/admin/incidents?status=<open|closed>
 *
 * Admin read surface for incident reports (v1 — list only; no
 * finalization/edit endpoints, see the incident-reporting plan).
 * super_admin sees every incident in the resolved org; location_admin is
 * scoped to the venues covered by getLocationIdsForUser (venue managers see
 * their own venues' incidents, not every location in the org) — same
 * pattern as /api/admin/venue-day/[date].ts.
 */
import type { APIRoute } from "astro";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { incidents, incidentStatusEnum } from "@/lib/db/schema/incidents";
import { venues } from "@/lib/db/schema/teams";
import { familyMembers } from "@/lib/db/schema/registrations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const statusParam = url.searchParams.get("status");
  type IncidentStatus = (typeof incidentStatusEnum.enumValues)[number];
  const statusValues: readonly string[] = incidentStatusEnum.enumValues;
  if (statusParam && !statusValues.includes(statusParam)) {
    return new Response(JSON.stringify({ error: "Invalid status filter" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");

  const conditions = [eq(incidents.organizationId, auth.organizationId)];
  if (statusParam) {
    conditions.push(eq(incidents.status, statusParam as IncidentStatus));
  }
  if (!isSuperAdmin) {
    const allowedLocationIds = await getLocationIdsForUser(auth.user.id);
    if (allowedLocationIds.length === 0) {
      return new Response(JSON.stringify({ incidents: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    conditions.push(inArray(venues.locationId, allowedLocationIds));
  }

  try {
    const rows = await getDb()
      .select({
        id: incidents.id,
        incidentType: incidents.incidentType,
        status: incidents.status,
        occurredAt: incidents.occurredAt,
        subjectType: incidents.subjectType,
        subjectFreeTextName: incidents.subjectFreeTextName,
        subjectFirstName: familyMembers.firstName,
        subjectLastName: familyMembers.lastName,
        venueId: incidents.venueId,
        venueName: venues.name,
        suspectedConcussion: incidents.suspectedConcussion,
        createdAt: incidents.createdAt,
      })
      .from(incidents)
      .innerJoin(venues, eq(incidents.venueId, venues.id))
      .leftJoin(familyMembers, eq(incidents.subjectFamilyMemberId, familyMembers.id))
      .where(and(...conditions))
      .orderBy(desc(incidents.createdAt));

    return new Response(JSON.stringify({ incidents: rows }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error listing incidents:", error);
    return new Response(JSON.stringify({ error: "Failed to list incidents" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};
