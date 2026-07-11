/**
 * POST /api/admin/venue/cancel-hold { bookingId }
 * Cancels a pending_claim (pay-link hold) drop-in booking so the desk can
 * release a slot without waiting out the 2h hold. Tenant-scoped: the booking's
 * session venue must be in the caller's effective locations.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";

export const prerender = false;
const json = (b: unknown, s: number) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const body = await context.request.json().catch(() => ({}));
  const bookingId = typeof body.bookingId === "string" ? body.bookingId : null;
  if (!bookingId) return json({ error: "bookingId required" }, 400);

  const db = getDb();
  const [row] = await db
    .select({
      id: dropInBookings.id,
      status: dropInBookings.status,
      locationId: venues.locationId,
      orgId: locations.organizationId,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .innerJoin(venues, eq(venues.id, dropInSessions.venueId))
    .innerJoin(locations, eq(locations.id, venues.locationId))
    .where(eq(dropInBookings.id, bookingId))
    .limit(1);

  if (!row || row.orgId !== auth.organizationId) return json({ error: "Not found" }, 404);

  const effectiveIds = await getEffectiveLocationIds({
    userId: auth.user.id,
    userRoles: auth.roles,
    activeLocationId: context.locals.activeLocationId,
  });
  if (effectiveIds !== null && !effectiveIds.includes(row.locationId)) {
    return json({ error: "Not found" }, 404);
  }

  if (row.status !== "pending_claim") {
    return json({ error: "Only pending pay-link holds can be cancelled" }, 409);
  }

  await db
    .update(dropInBookings)
    .set({ status: "cancelled", cancelledAt: new Date() })
    .where(and(eq(dropInBookings.id, bookingId), eq(dropInBookings.status, "pending_claim")));

  return json({ ok: true }, 200);
};
