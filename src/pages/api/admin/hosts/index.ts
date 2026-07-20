import type { APIRoute } from "astro";
import { and, asc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostProfiles, hostGameReports } from "@/lib/db/schema/hosts";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { venueLocationCondition } from "@/lib/admin/location-scope-filter";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET /api/admin/hosts — host roster for the admin Hosts tab + session-form
 * picker. Also returns `unhostedUpcoming`, an org+location-scoped count of
 * scheduled pickup sessions with no host assigned, used to drive the "needs
 * a host" nudge in the admin UI.
 */
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

  const locIds = await getEffectiveLocationIds({
    userId: context.locals.user!.id,
    userRoles: context.locals.userRoles ?? [],
    activeLocationId: context.locals.activeLocationId ?? null,
  });
  const scopeCond = venueLocationCondition(locIds);

  const [cnt] = await getDb()
    .select({ n: sql<number>`COUNT(*)::int` })
    .from(dropInSessions)
    .leftJoin(venues, eq(venues.id, dropInSessions.venueId))
    .where(
      and(
        eq(dropInSessions.organizationId, auth.organizationId),
        eq(dropInSessions.status, "scheduled"),
        eq(dropInSessions.kind, "pickup"),
        isNull(dropInSessions.hostUserId),
        gt(dropInSessions.startsAt, new Date()),
        scopeCond,
      ),
    );

  return json({ hosts: rows, unhostedUpcoming: cnt?.n ?? 0 }, 200);
};

/**
 * POST /api/admin/hosts — manual host creation: turns an existing user into
 * an active host without going through the job-application approval flow
 * (e.g. an admin promoting a regular player they already know). Mirrors the
 * user-validation shape of approve-host.ts (user must exist) but does NOT
 * require org membership — hosts are community volunteers, not staff.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let body: { userId?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.userId) return json({ error: "userId required" }, 400);

  const db = getDb();

  const [user] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, body.userId))
    .orderBy(asc(users.createdAt))
    .limit(1);
  if (!user) return json({ error: "User not found" }, 404);

  const [existing] = await db
    .select({ id: hostProfiles.id })
    .from(hostProfiles)
    .where(
      and(
        eq(hostProfiles.userId, body.userId),
        eq(hostProfiles.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(hostProfiles.createdAt))
    .limit(1);
  if (existing) return json({ error: "Already a host in this organization" }, 409);

  const [created] = await db
    .insert(hostProfiles)
    .values({
      userId: body.userId,
      organizationId: auth.organizationId,
      status: "active",
      approvedByUserId: auth.user.id,
    })
    .returning();

  return json({ host: created }, 201);
};
