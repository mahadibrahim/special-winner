/**
 * GET /api/admin/venue/today?date=YYYY-MM-DD&locationId=<uuid|empty>
 *
 * Returns VenueTodayPayload for the venue command-center.
 *
 * Auth: requires any admin role (super_admin or location_admin).
 * Scoping: super_admins can read any location; location_admins are restricted
 *   to their assigned locations via requireSameLocation.
 *
 * When locationId is omitted/empty, uses a default location: the first
 * scoped location for a location_admin, or the org's earliest-created
 * location for a super_admin (mirroring the /admin/venue page resolution).
 */

import type { APIRoute } from "astro";
import { getVenueDayData } from "@/lib/admin/venue-day-data";
import { buildVenueToday } from "@/lib/venue/build-today";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { requireSameLocation } from "@/lib/auth/require-resource-ownership";
import { parseStripDate } from "@/lib/admin/week-strip";
import { getDb } from "@/lib/db";
import { locations } from "@/lib/db/schema";
import { eq, asc } from "drizzle-orm";

export const prerender = false;

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
    },
  });

export const GET: APIRoute = async ({ url, locals }) => {
  // --- Auth ---
  if (!locals.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const userRoleNames = (locals.userRoles ?? []).map((r: { name: string }) => r.name);
  const isAdmin =
    userRoleNames.includes("super_admin") ||
    userRoleNames.includes("location_admin");
  if (!isAdmin) {
    return json({ error: "Forbidden" }, 403);
  }

  // --- Date validation ---
  const dateParam = url.searchParams.get("date") ?? "";
  if (!dateParam || !parseStripDate(dateParam)) {
    return json({ error: "Invalid or missing date (expected YYYY-MM-DD)" }, 400);
  }

  // --- Location resolution ---
  const isSuperAdmin = userRoleNames.includes("super_admin");
  const locationIdParam = url.searchParams.get("locationId") ?? "";

  let locationId: string;
  let allowedIds: string[];

  if (isSuperAdmin) {
    if (locationIdParam) {
      locationId = locationIdParam;
      allowedIds = [locationId];
    } else {
      // No locationId → fall back to the org's earliest-created location,
      // mirroring how /admin/venue index.astro + day/[date].astro resolve the
      // default location for a super-admin.
      const superOrgId = locals.organization?.id;
      if (!superOrgId) {
        return json({ error: "Organization context missing" }, 400);
      }
      const [firstLocation] = await getDb()
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.organizationId, superOrgId))
        .orderBy(asc(locations.createdAt))
        .limit(1);
      if (!firstLocation) {
        return json({ error: "No location found for organization" }, 404);
      }
      locationId = firstLocation.id;
      allowedIds = [locationId];
    }
  } else {
    // Location-admin: resolve allowed location IDs from the user's role scope.
    allowedIds = await getLocationIdsForUser(locals.user.id);

    if (locationIdParam) {
      // Explicit locationId requested — enforce scoping.
      const check = requireSameLocation(allowedIds, locationIdParam);
      if (!check.ok) {
        return json({ error: "Not found" }, 404);
      }
      locationId = locationIdParam;
    } else {
      // No locationId → use the first scoped location.
      if (allowedIds.length === 0) {
        return json({ error: "No location scope found for this user" }, 400);
      }
      locationId = allowedIds[0];
    }
  }

  const orgId = locals.organization?.id;
  if (!orgId) {
    return json({ error: "Organization context missing" }, 400);
  }

  // --- Data fetch + shape ---
  try {
    const dayData = await getVenueDayData(locationId, dateParam);
    if (!dayData) {
      return json({ error: "Location not found" }, 404);
    }

    const timezone = locals.organization?.timezone ?? "America/New_York";
    const payload = await buildVenueToday(
      dayData,
      orgId,
      locals.user.id,
      allowedIds,
      timezone,
    );

    return json(payload);
  } catch (err) {
    console.error("[/api/admin/venue/today] failed:", err);
    return json({ error: "Failed to load venue today data" }, 500);
  }
};
