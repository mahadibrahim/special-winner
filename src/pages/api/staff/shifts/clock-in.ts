/**
 * POST /api/staff/shifts/clock-in
 *
 * Hourly clock-in for coaches/venue managers (Task 8,
 * docs/superpowers/plans/2026-07-07-time-tracking.md). Referees clock in
 * per-match via a separate endpoint
 * (POST /api/referee/matches/[gameId]/check-in, Task 12).
 *
 * Order of checks, each a distinct failure mode:
 *   1. requireStaffAccess — must hold super_admin/location_admin/coach.
 *   2. deriveLaborRole — must resolve to coach or venue_manager (403 if
 *      neither role is assigned; this can differ from #1's admitted set,
 *      e.g. a bare super_admin with no coach/location_admin role assignment).
 *   3. requireSameOrgVenue — venueId must belong to the caller's org (404).
 *   4. Location consent (409 consent_required) — mandatory
 *      employment-condition acknowledgement (owner decision #1).
 *   5. computeGeofenceDecision — BLOCKS (422) on no fix / imprecise fix /
 *      clearly-outside fix (owner decision #2, 2026-07-07 update). An
 *      "uncertain" fix is allowed through but flagged for admin review.
 *   6. Insert — 409 already_clocked_in on the one-open-shift-per-user
 *      partial unique index.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireStaffAccess } from "@/lib/auth";
import {
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { venues } from "@/lib/db/schema/teams";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { eq } from "drizzle-orm";
import { deriveLaborRole } from "@/lib/time-tracking/derive-labor-role";
import { hasCurrentLocationConsent } from "@/lib/time-tracking/consent";
import { computeGeofenceDecision } from "@/lib/time-tracking/geofence";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const clockInSchema = z.object({
  venueId: z.string().uuid(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});

const BLOCK_MESSAGES: Record<string, string> = {
  missing_location:
    "Location is required to clock in — it's a condition of employment. Enable location access and try again.",
  imprecise_location:
    "Your location isn't precise enough to verify — enable high-accuracy/precise location and try again.",
  out_of_range: "You're too far from the venue to clock in from here.",
};

export const POST: APIRoute = async (context) => {
  const auth = await requireStaffAccess(context);
  if (!auth.authorized) return auth.response;

  const role = deriveLaborRole(auth.roles.map((r) => r.name));
  if (!role) {
    return json({ error: "Forbidden: no coach or venue manager role assigned" }, 403);
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = clockInSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;

  const venueCheck = await requireSameOrgVenue(auth.organizationId, data.venueId);
  if (!venueCheck.ok) return ownershipDeniedResponse();

  if (!(await hasCurrentLocationConsent(auth.user.id, auth.organizationId))) {
    return json(
      {
        error: "You must acknowledge the location-tracking notice before clocking in.",
        reason: "consent_required",
      },
      409,
    );
  }

  const db = getDb();
  const [venueRow] = await db
    .select({
      latitude: venues.latitude,
      longitude: venues.longitude,
      radiusM: venues.radiusM,
    })
    .from(venues)
    .where(eq(venues.id, data.venueId))
    .limit(1);

  const venueLat = venueRow?.latitude != null ? Number(venueRow.latitude) : null;
  const venueLng = venueRow?.longitude != null ? Number(venueRow.longitude) : null;

  const clockLat = data.lat ?? null;
  const clockLng = data.lng ?? null;
  const accuracyM = data.accuracy ?? null;

  const geofence = computeGeofenceDecision(
    venueLat,
    venueLng,
    venueRow?.radiusM ?? null,
    clockLat,
    clockLng,
    accuracyM,
  );

  if (geofence.blocked) {
    return json(
      {
        error: BLOCK_MESSAGES[geofence.flagReason ?? "out_of_range"],
        reason: geofence.flagReason,
      },
      422,
    );
  }

  try {
    const now = new Date();
    const [timeEntry] = await db
      .insert(timeEntries)
      .values({
        organizationId: auth.organizationId,
        userId: auth.user.id,
        venueId: data.venueId,
        role,
        gameId: null,
        clockInAt: now,
        clockInLat: clockLat != null ? clockLat.toFixed(6) : null,
        clockInLng: clockLng != null ? clockLng.toFixed(6) : null,
        clockInAccuracyM: accuracyM != null ? Math.round(accuracyM) : null,
        clockInDistanceM: geofence.distanceM != null ? Math.round(geofence.distanceM) : null,
        flaggedOutOfRange: geofence.flagged,
        flagReason: geofence.flagReason,
      })
      .returning();

    return json({ timeEntry }, 201);
  } catch (error: any) {
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return json({ error: "Already clocked in to an open shift", reason: "already_clocked_in" }, 409);
    }
    console.error("Error clocking in:", error);
    return json({ error: "Failed to clock in" }, 500);
  }
};
