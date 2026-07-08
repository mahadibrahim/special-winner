/**
 * GET /api/admin/labor/time-entries?venueId=&from=YYYY-MM-DD&to=YYYY-MM-DD&flaggedOnly=1
 *
 * Admin read surface for time_entries (Task 14,
 * docs/superpowers/plans/2026-07-07-time-tracking.md) — this is the review
 * surface the owner's anti-gaming geofence design relies on: an "uncertain"
 * clock-in isn't blocked, it's recorded and flagged for a human to review
 * here, so flagged rows are surfaced prominently (flaggedOutOfRange +
 * flagReason on every row, plus the flaggedOnly filter to isolate them).
 *
 * Tenant scoping mirrors /api/admin/incidents and
 * /api/admin/labor/gusto-export: requireOrgAdminAccess pins the org;
 * super_admin sees every venue in-org, location_admin is scoped via
 * getLocationIdsForUser -> venues.locationId.
 */
import type { APIRoute } from "astro";
import { and, between, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { organizations } from "@/lib/db/schema/organizations";
import { users } from "@/lib/db/schema/users";
import { venues } from "@/lib/db/schema/teams";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { resolvePayPeriodBoundsUtc } from "@/lib/payroll/pay-period";
import { requireSameOrgVenue } from "@/lib/auth/require-resource-ownership";

export const prerender = false;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const url = new URL(context.request.url);
  const venueIdParam = url.searchParams.get("venueId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const flaggedOnly = url.searchParams.get("flaggedOnly") === "1";

  if ((from && !to) || (!from && to)) {
    return json({ error: "from and to must both be provided together" }, 400);
  }
  if (from && !DATE_RE.test(from)) return json({ error: "from must be YYYY-MM-DD" }, 400);
  if (to && !DATE_RE.test(to)) return json({ error: "to must be YYYY-MM-DD" }, 400);

  if (venueIdParam) {
    const venueCheck = await requireSameOrgVenue(auth.organizationId, venueIdParam);
    if (!venueCheck.ok) return json({ error: "Venue not found" }, 404);
  }

  const db = getDb();

  const conditions = [eq(timeEntries.organizationId, auth.organizationId)];
  if (venueIdParam) conditions.push(eq(timeEntries.venueId, venueIdParam));
  if (flaggedOnly) conditions.push(eq(timeEntries.flaggedOutOfRange, true));

  if (from && to) {
    const [orgRow] = await db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, auth.organizationId))
      .limit(1);
    const tz = orgRow?.timezone ?? "America/New_York";
    try {
      const { startUtc, endUtc } = resolvePayPeriodBoundsUtc(from, to, tz);
      conditions.push(between(timeEntries.clockInAt, startUtc, endUtc));
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Invalid period" }, 400);
    }
  }

  const isSuperAdmin = auth.roles.some((r) => r.name === "super_admin");
  if (!isSuperAdmin) {
    const allowedLocationIds = await getLocationIdsForUser(auth.user.id);
    if (allowedLocationIds.length === 0) {
      return json({ timeEntries: [] });
    }
    conditions.push(inArray(venues.locationId, allowedLocationIds));
  }

  const rows = await db
    .select({
      id: timeEntries.id,
      userId: timeEntries.userId,
      userFirstName: users.firstName,
      userLastName: users.lastName,
      venueId: timeEntries.venueId,
      venueName: venues.name,
      role: timeEntries.role,
      gameId: timeEntries.gameId,
      clockInAt: timeEntries.clockInAt,
      clockOutAt: timeEntries.clockOutAt,
      clockInDistanceM: timeEntries.clockInDistanceM,
      clockInAccuracyM: timeEntries.clockInAccuracyM,
      clockOutAccuracyM: timeEntries.clockOutAccuracyM,
      flaggedOutOfRange: timeEntries.flaggedOutOfRange,
      flagReason: timeEntries.flagReason,
      notes: timeEntries.notes,
    })
    .from(timeEntries)
    .innerJoin(users, eq(timeEntries.userId, users.id))
    .innerJoin(venues, eq(timeEntries.venueId, venues.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.clockInAt));

  return json({ timeEntries: rows });
};
