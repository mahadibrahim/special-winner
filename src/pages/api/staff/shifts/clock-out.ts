/**
 * POST /api/staff/shifts/clock-out
 *
 * Closes the caller's open hourly shift (Task 9,
 * docs/superpowers/plans/2026-07-07-time-tracking.md). Unlike clock-in,
 * clock-out is NEVER geofence-blocked — a completed shift shouldn't get
 * stuck because of a bad fix on the way out. Coordinates/accuracy are
 * still captured (for audit) whenever the client supplies them.
 *
 * Finds the open shift by (userId, gameId IS NULL, clockOutAt IS NULL) —
 * the partial unique index guarantees at most one such row — with an
 * explicit orderBy per the multi-tenant query-hazard convention even
 * though at most one row can match. Fires
 * closeStaffShiftActivitiesForVenueToday fire-and-forget, mirroring the
 * pattern in src/pages/api/staff/incidents/index.ts.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { and, asc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireStaffAccess } from "@/lib/auth";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { closeStaffShiftActivitiesForVenueToday } from "@/lib/activity-tracking/close-staff-shift";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const clockOutSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireStaffAccess(context);
  if (!auth.authorized) return auth.response;

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }

  const parsed = clockOutSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;

  const db = getDb();
  const [openShift] = await db
    .select({ id: timeEntries.id, venueId: timeEntries.venueId })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.userId, auth.user.id),
        isNull(timeEntries.gameId),
        isNull(timeEntries.clockOutAt),
      ),
    )
    .orderBy(asc(timeEntries.createdAt))
    .limit(1);

  if (!openShift) {
    return json({ error: "No open shift to clock out of", reason: "no_open_shift" }, 404);
  }

  const now = new Date();
  const [updated] = await db
    .update(timeEntries)
    .set({
      clockOutAt: now,
      clockOutLat: data.lat != null ? data.lat.toFixed(6) : null,
      clockOutLng: data.lng != null ? data.lng.toFixed(6) : null,
      clockOutAccuracyM: data.accuracy != null ? Math.round(data.accuracy) : null,
      updatedAt: now,
    })
    .where(eq(timeEntries.id, openShift.id))
    .returning();

  // Fire-and-forget: closing today's staff-shift activity rows at the
  // venue must not block the clock-out response, and a failure here
  // doesn't invalidate the clock-out that already saved.
  closeStaffShiftActivitiesForVenueToday(openShift.venueId, { byUserId: auth.user.id }).catch(
    (err) => {
      console.error(
        `[close-staff-shift] failed for venue ${openShift.venueId} after clock-out ${openShift.id}:`,
        err,
      );
    },
  );

  return json({ timeEntry: updated }, 200);
};
