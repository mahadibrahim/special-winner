import type { APIRoute } from "astro";
import { asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostProfiles, hostGameReports } from "@/lib/db/schema/hosts";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** GET /api/admin/hosts — host roster for the admin Hosts tab + session-form picker. */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const rows = await getDb()
    .select({
      id: hostProfiles.id,
      userId: hostProfiles.userId,
      status: hostProfiles.status,
      preferredVenueId: hostProfiles.preferredVenueId,
      venueName: venues.name,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      gamesHosted: sql<number>`(
        SELECT COUNT(*)::int FROM ${dropInSessions}
        WHERE ${dropInSessions.hostUserId} = ${hostProfiles.userId}
          AND ${dropInSessions.organizationId} = ${hostProfiles.organizationId}
      )`,
      lastReportAt: sql<string | null>`(
        SELECT MAX(r.created_at) FROM ${hostGameReports} r
        WHERE r.host_profile_id = ${hostProfiles.id}
      )`,
      incidentCount: sql<number>`(
        SELECT COUNT(*)::int FROM ${hostGameReports} r
        WHERE r.host_profile_id = ${hostProfiles.id} AND r.incident_flagged
      )`,
    })
    .from(hostProfiles)
    .innerJoin(users, eq(users.id, hostProfiles.userId))
    .leftJoin(venues, eq(venues.id, hostProfiles.preferredVenueId))
    .where(eq(hostProfiles.organizationId, auth.organizationId))
    .orderBy(asc(hostProfiles.createdAt));

  return json({ hosts: rows }, 200);
};
