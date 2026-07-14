/**
 * POST /api/admin/dropin/sessions/:id/cancel
 *
 * Admin-cancels the session. Marks the session row cancelled, then for
 * every still-active booking runs the refund pipeline as an admin
 * override (full refund regardless of cancel-window).
 *
 * Org- AND location-scoped: a venue manager can only cancel sessions whose
 * venue is in their assigned locations (super-admin is unscoped).
 */
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { removeSourceBlock } from "@/lib/scheduling/blocks";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { processCancelRefund } from "@/lib/dropin/refund";
import { removeHostFromSession } from "@/lib/dropin/host-assignment";
import { dispatchBookingCancelledByAdmin } from "@/lib/dropin/messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  let body: { reason?: string } = {};
  try {
    if (context.request.headers.get("content-length")) {
      body = await context.request.json();
    }
  } catch {
    /* empty body is fine */
  }

  const db = getDb();

  // Tenant guard.
  const [session] = await db
    .select()
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, id),
        eq(dropInSessions.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);
  if (!(await callerCanActOnVenue(context, session.venueId))) {
    return json({ error: "Session not found" }, 404);
  }
  if (session.status === "cancelled") {
    return json({ error: "Session already cancelled" }, 409);
  }

  // Host removal runs BEFORE the booking sweep: it clears
  // drop_in_sessions.host_user_id (the sweep below never touches that
  // column) and cancels the host's $0 host_comp booking directly. Doing
  // this first means the host_comp row is already `cancelled` by the time
  // the active-bookings query below runs, so it's excluded from the
  // refund sweep rather than swept as a refundable booking — moot for
  // Stripe (host_comp rows have no paymentIntent, so processCancelRefund's
  // refund guard already skips them), but it keeps the host-removal path
  // as the single writer of host_user_id. Because the lib cancels the comp
  // booking without messaging, we dispatch the same booking-cancellation
  // notice every other booker gets (refunded: false — a $0 comp has nothing
  // to refund); a host with a paid player booking instead (compBookingId
  // null on assign) is notified by the sweep like any other booker.
  if (session.hostUserId) {
    const removed = await removeHostFromSession({
      sessionId: id,
      reason: "session_cancelled",
    });
    if (removed.cancelledCompBookingId) {
      await awaitDispatch(
        "dropin host comp-booking cancelled (session cancel)",
        () =>
          dispatchBookingCancelledByAdmin(removed.cancelledCompBookingId!, {
            reason: "session_cancelled",
            refunded: false,
          }),
        { bookingId: removed.cancelledCompBookingId },
      );
    }
  }

  // Pull active bookings for refund processing.
  const activeBookings = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, id),
        inArray(dropInBookings.status, [
          "confirmed",
          "waitlisted",
          "pending_payment",
          "pending_claim",
        ]),
      ),
    );

  // Refunds in small parallel batches: the slow part is the Stripe call
  // per booking, and nothing here holds a DB connection across it (no
  // transactions in processCancelRefund), so overlapping the network
  // waits is safe. Batch size stays modest to respect Stripe rate limits.
  let refunded = 0;
  const REFUND_BATCH = 5;
  for (let i = 0; i < activeBookings.length; i += REFUND_BATCH) {
    const batch = activeBookings.slice(i, i + REFUND_BATCH);
    const results = await Promise.allSettled(
      batch.map((b) =>
        processCancelRefund(b.id, {
          adminOverride: true,
          reason: body.reason ?? "session_cancelled",
        }),
      ),
    );
    for (const r of results) {
      if (r.status === "fulfilled" && r.value.refunded) refunded += 1;
    }
  }

  await db
    .update(dropInSessions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(dropInSessions.id, id));

  // Cancelled → free its field-time-ledger block.
  await removeSourceBlock("drop_in", id);

  return json(
    {
      ok: true,
      cancelledBookings: activeBookings.length,
      refundedBookings: refunded,
    },
    200,
  );
};
