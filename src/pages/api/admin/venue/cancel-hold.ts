/**
 * POST /api/admin/venue/cancel-hold { bookingId }
 * Cancels a pending_payment (walk-in pay-link hold) drop-in booking so the
 * desk can release a slot early. Tenant-scoped: the booking's session venue
 * must be in the caller's effective locations.
 *
 * `status` is the discriminator between the two hold kinds — see event.ts's
 * module comment:
 *   - pending_payment → walk-in pay-link hold (kiosk/walkin/start) — these
 *     are what this endpoint is for.
 *   - pending_claim   → promoted waitlister (lib/dropin/promotion.ts) —
 *     these expire on their own or get claimed by the customer via a
 *     different link; the desk does not cancel them here (409).
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { locations } from "@/lib/db/schema/organizations";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { promoteNextWaitlister } from "@/lib/dropin/promotion";

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
      checkedInAt: dropInBookings.checkedInAt,
      sessionId: dropInBookings.sessionId,
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

  // Promoted-waitlister rows are pending_claim, not a walk-in hold: they
  // expire on their own (expire-pending-claims cron) or get claimed by the
  // customer via their promotion link. Cancelling one here would skip
  // promoteNextWaitlister and desync the waitlist.
  if (row.status === "pending_claim") {
    return json(
      {
        error:
          "This hold is a waitlist promotion — it expires on its own or is claimed by the customer",
      },
      409,
    );
  }

  if (row.status !== "pending_payment") {
    return json({ error: "Only pending pay-link holds can be cancelled" }, 409);
  }

  // Someone is already on the field — releasing the hold now would be
  // pulling the slot out from under a person actually present.
  if (row.checkedInAt !== null) {
    return json({ error: "This person has already checked in — the hold can't be released" }, 409);
  }

  const cancelledRows = await db
    .update(dropInBookings)
    .set({ status: "cancelled", cancelledAt: new Date(), cancellationReason: "admin_override" })
    .where(and(eq(dropInBookings.id, bookingId), eq(dropInBookings.status, "pending_payment")))
    .returning({ id: dropInBookings.id });

  // Every other release path — the expiry sweep (expireOverduePromotions)
  // and customer/admin cancels via processCancelRefund — promotes the next
  // waitlister into the freed slot. The desk cancel must too, or a manual
  // release leaves the slot unfilled while people sit waitlisted. Guarded
  // on the UPDATE actually cancelling a row (the status predicate makes it
  // a no-op if a concurrent payment just confirmed the booking — no slot
  // was freed, so nobody should be promoted). Fire-and-log, same as
  // refund.ts: a promotion failure must not turn a successful cancel into
  // a 500.
  if (cancelledRows.length > 0) {
    try {
      await promoteNextWaitlister(row.sessionId);
    } catch (err) {
      console.error("[cancel-hold] promote-next failed", err);
    }
  }

  return json({ ok: true }, 200);
};
