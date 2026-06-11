/**
 * POST /api/admin/venue-day/holds
 *
 * Create an external (Good Rec / email) or maintenance hold in the
 * field-time ledger — THE entry point that makes the venue partner's
 * off-platform bookings visible to availability. Designed for the
 * sub-ten-second flow on the venue-day calendar.
 *
 * Auth mirrors the venue-day read: super_admins anywhere; venue managers
 * (location_admins) only at their locations, with 404 (not 403) on
 * cross-location ids so existence doesn't leak.
 */
import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { venueResources } from "@/lib/db/schema/scheduling";
import { venues } from "@/lib/db/schema/teams";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { requireSameLocation } from "@/lib/auth/require-resource-ownership";
import {
  createManualBlock,
  BlockConflictError,
} from "@/lib/scheduling/blocks";

const bodySchema = z.object({
  resourceId: z.string().uuid(),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  sourceType: z.enum(["external", "maintenance"]),
  label: z.string().trim().min(1, "Label is required").max(200),
  notes: z.string().trim().max(2000).optional(),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const userRoleNames = (locals.userRoles ?? []).map((r) => r.name);
  const isAdminish =
    userRoleNames.includes("super_admin") ||
    userRoleNames.includes("location_admin");
  if (!isAdminish) return json({ error: "Forbidden" }, 403);

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }
  const data = parsed.data;

  const startsAt = new Date(data.startsAt);
  const endsAt = new Date(data.endsAt);
  if (endsAt <= startsAt) {
    return json({ error: "End time must be after start time" }, 400);
  }

  // Resolve the resource's location for scoping.
  const [resource] = await getDb()
    .select({ id: venueResources.id, locationId: venues.locationId })
    .from(venueResources)
    .innerJoin(venues, eq(venueResources.venueId, venues.id))
    .where(eq(venueResources.id, data.resourceId))
    .limit(1);
  if (!resource) return json({ error: "Not found" }, 404);

  if (!userRoleNames.includes("super_admin")) {
    const allowedIds = await getLocationIdsForUser(locals.user.id);
    const check = requireSameLocation(allowedIds, resource.locationId);
    if (!check.ok) return json({ error: "Not found" }, 404);
  }

  try {
    const block = await createManualBlock({
      resourceId: data.resourceId,
      startsAt,
      endsAt,
      sourceType: data.sourceType,
      label: data.label,
      notes: data.notes ?? null,
      createdByUserId: locals.user.id,
    });
    return json({ hold: block }, 201);
  } catch (err) {
    if (err instanceof BlockConflictError) {
      return json({ error: err.message, conflict: err.conflict }, 409);
    }
    throw err;
  }
};
