/**
 * DELETE /api/admin/venue-day/holds/:id
 *
 * Remove a manual (external/maintenance) hold. Source-backed blocks
 * (games, rentals, drop-ins) are NOT deletable here — they release
 * through their source's lifecycle. Auth mirrors the venue-day read.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { resourceBlocks, venueResources } from "@/lib/db/schema/scheduling";
import { venues } from "@/lib/db/schema/teams";
import { getLocationIdsForUser } from "@/lib/auth/location-scope";
import { requireSameLocation } from "@/lib/auth/require-resource-ownership";
import { deleteManualBlock } from "@/lib/scheduling/blocks";

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const userRoleNames = (locals.userRoles ?? []).map((r) => r.name);
  const isAdminish =
    userRoleNames.includes("super_admin") ||
    userRoleNames.includes("location_admin");
  if (!isAdminish) return json({ error: "Forbidden" }, 403);

  const id = params.id;
  if (!id) return json({ error: "Hold id required" }, 400);

  // Location scoping via the block's resource.
  const [row] = await getDb()
    .select({ locationId: venues.locationId, sourceType: resourceBlocks.sourceType })
    .from(resourceBlocks)
    .innerJoin(venueResources, eq(resourceBlocks.resourceId, venueResources.id))
    .innerJoin(venues, eq(venueResources.venueId, venues.id))
    .where(eq(resourceBlocks.id, id))
    .limit(1);
  if (!row) return json({ error: "Not found" }, 404);

  if (!userRoleNames.includes("super_admin")) {
    const allowedIds = await getLocationIdsForUser(locals.user.id);
    const check = requireSameLocation(allowedIds, row.locationId);
    if (!check.ok) return json({ error: "Not found" }, 404);
  }

  const deleted = await deleteManualBlock(id);
  if (!deleted) {
    // Exists but isn't a manual hold (or raced a delete).
    return json(
      { error: "Only external/maintenance holds can be removed here" },
      409,
    );
  }
  return json({ success: true }, 200);
};
