/**
 * POST /api/referee/matches/[gameId]/check-in
 *
 * Per-match referee check-in (Task 12,
 * docs/superpowers/plans/2026-07-07-time-tracking.md), replacing the prior
 * manual signature capture (act.ref_check_in) with the in-app time
 * tracking flow. Starts the stipend clock the same way the signature used
 * to, by firing evt.referee_check_in_recorded.
 *
 * Tenant scope is defense-in-depth here: requireAssignedOfficial (a
 * gameOfficials row for gameId+userId) is the primary gate — same as
 * every other /api/referee/** endpoint (report.ts, ejections.ts) — but is
 * additionally backed by requireSameOrgGame against the domain-resolved
 * organization, so a cross-org gameId 404s even in a hypothetical future
 * where an assignment leaked across orgs.
 *
 * Shares the mandatory location-consent gate and the accuracy-aware
 * geofence block with the staff clock-in endpoint (same owner decisions).
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { requireOrganizationContext } from "@/lib/auth";
import {
  requireSameOrgGame,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { requireAssignedOfficial } from "@/lib/referee/require-assigned-official";
import { games, venues } from "@/lib/db/schema/teams";
import { timeEntries } from "@/lib/db/schema/time-tracking";
import { hasCurrentLocationConsent } from "@/lib/time-tracking/consent";
import { computeGeofenceDecision } from "@/lib/time-tracking/geofence";
import { markCompleteBySystemEvent } from "@/lib/activity-tracking/mark-complete";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

const checkInSchema = z.object({
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
  accuracy: z.number().min(0).optional(),
});

const BLOCK_MESSAGES: Record<string, string> = {
  missing_location:
    "Location is required to check in — it's a condition of your assignment. Enable location access and try again.",
  imprecise_location:
    "Your location isn't precise enough to verify — enable high-accuracy/precise location and try again.",
  out_of_range: "You're too far from the venue to check in from here.",
};

export const POST: APIRoute = async (context) => {
  const user = context.locals.user;
  if (!user) return json({ error: "Unauthorized" }, 401);
  const gameId = context.params.gameId;
  if (!gameId) return json({ error: "game id required" }, 400);

  if (!(await requireAssignedOfficial(user.id, gameId))) {
    return json({ error: "Not found" }, 404);
  }

  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  const gameCheck = await requireSameOrgGame(orgContext.organizationId, gameId);
  if (!gameCheck.ok) return ownershipDeniedResponse();

  if (!(await hasCurrentLocationConsent(user.id, orgContext.organizationId))) {
    return json(
      {
        error: "You must acknowledge the location-tracking notice before checking in.",
        reason: "consent_required",
      },
      409,
    );
  }

  let body: unknown;
  try {
    body = await context.request.json();
  } catch {
    body = {};
  }
  const parsed = checkInSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return json({ error: "Validation failed", issues: parsed.error.issues }, 400);
  }
  const data = parsed.data;

  const db = getDb();
  const [gameRow] = await db
    .select({
      venueId: games.venueId,
      venueLat: venues.latitude,
      venueLng: venues.longitude,
      venueRadiusM: venues.radiusM,
    })
    .from(games)
    .leftJoin(venues, eq(games.venueId, venues.id))
    .where(eq(games.id, gameId))
    .limit(1);

  if (!gameRow?.venueId) {
    return json(
      { error: "This match has no venue assigned yet — contact your assignor.", reason: "no_venue" },
      400,
    );
  }

  const venueLat = gameRow.venueLat != null ? Number(gameRow.venueLat) : null;
  const venueLng = gameRow.venueLng != null ? Number(gameRow.venueLng) : null;
  const clockLat = data.lat ?? null;
  const clockLng = data.lng ?? null;
  const accuracyM = data.accuracy ?? null;

  const geofence = computeGeofenceDecision(
    venueLat,
    venueLng,
    gameRow.venueRadiusM ?? null,
    clockLat,
    clockLng,
    accuracyM,
  );

  if (geofence.blocked) {
    return json(
      { error: BLOCK_MESSAGES[geofence.flagReason ?? "out_of_range"], reason: geofence.flagReason },
      422,
    );
  }

  try {
    const now = new Date();
    const [timeEntry] = await db
      .insert(timeEntries)
      .values({
        organizationId: orgContext.organizationId,
        userId: user.id,
        venueId: gameRow.venueId,
        role: "referee",
        gameId,
        clockInAt: now,
        clockInLat: clockLat != null ? clockLat.toFixed(6) : null,
        clockInLng: clockLng != null ? clockLng.toFixed(6) : null,
        clockInAccuracyM: accuracyM != null ? Math.round(accuracyM) : null,
        clockInDistanceM: geofence.distanceM != null ? Math.round(geofence.distanceM) : null,
        flaggedOutOfRange: geofence.flagged,
        flagReason: geofence.flagReason,
      })
      .returning();

    // Fire-and-forget: starting the stipend clock must not block the
    // check-in response, mirroring src/pages/api/staff/incidents/index.ts.
    markCompleteBySystemEvent(gameId, "evt.referee_check_in_recorded").catch((err) => {
      console.error(
        `[mark-complete] evt.referee_check_in_recorded for game ${gameId} failed:`,
        err,
      );
    });

    return json({ timeEntry }, 201);
  } catch (error: any) {
    if (error?.code === "23505" || error?.cause?.code === "23505") {
      return json(
        { error: "Already checked in to this match", reason: "already_checked_in" },
        409,
      );
    }
    console.error("Error checking in referee:", error);
    return json({ error: "Failed to check in" }, 500);
  }
};
