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
import { requireAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { processCancelRefund } from "@/lib/dropin/refund";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

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
