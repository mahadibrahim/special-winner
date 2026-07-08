/**
 * GET /api/staff/shifts/current
 *
 * Returns the caller's open hourly shift, if any (Task 10,
 * docs/superpowers/plans/2026-07-07-time-tracking.md). Drives the
 * clock-in vs. clock-out button state on /staff/shifts.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireStaffAccess } from "@/lib/auth";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { venues } from "@/lib/db/schema/teams";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const GET: APIRoute = async (context) => {
  const auth = await requireStaffAccess(context);
  if (!auth.authorized) return auth.response;

  const [openShift] = await getDb()
    .select({
      id: timeEntries.id,
      venueId: timeEntries.venueId,
      venueName: venues.name,
      role: timeEntries.role,
      clockInAt: timeEntries.clockInAt,
      flaggedOutOfRange: timeEntries.flaggedOutOfRange,
      flagReason: timeEntries.flagReason,
    })
    .from(timeEntries)
    .innerJoin(venues, eq(timeEntries.venueId, venues.id))
    .where(
      and(
        eq(timeEntries.userId, auth.user.id),
        isNull(timeEntries.gameId),
        isNull(timeEntries.clockOutAt),
      ),
    )
    .orderBy(asc(timeEntries.createdAt))
    .limit(1);

  return json({ timeEntry: openShift ?? null });
};
