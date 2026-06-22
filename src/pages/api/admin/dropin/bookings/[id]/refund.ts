/**
 * POST /api/admin/dropin/bookings/:id/refund
 *
 * Admin override: cancels the booking + issues refund regardless of the
 * cancel-window policy. Tenant-scoped — requires the booking to belong
 * to the active organization.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { requireAdminAccess } from "@/lib/auth/roles";
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

  const id = context.params.id;
  if (!id) return json({ error: "Booking id required" }, 400);

  // Org context is required for tenant scoping. It is legitimately nullable
  // (unresolved host, or a swallowed resolution failure in middleware) — fail
  // fast so the ownership comparison below can never be skipped.
  const org = context.locals.organization;
  if (!org) return json({ error: "Organization context required" }, 400);

  let body: { reason?: string } = {};
  try {
    if (context.request.headers.get("content-length")) {
      body = await context.request.json();
    }
  } catch {
    // empty body is fine
  }

  // Tenant scope: confirm the booking's session belongs to the active org.
  const db = getDb();
  const [row] = await db
    .select({
      bookingId: dropInBookings.id,
      organizationId: dropInSessions.organizationId,
    })
    .from(dropInBookings)
    .innerJoin(
      dropInSessions,
      eq(dropInSessions.id, dropInBookings.sessionId),
    )
    .where(eq(dropInBookings.id, id))
    .limit(1);
  if (!row) return json({ error: "Booking not found" }, 404);
  if (row.organizationId !== org.id) {
    return json({ error: "Forbidden" }, 403);
  }

  const result = await processCancelRefund(id, {
    adminOverride: true,
    reason: body.reason,
  });
  if (!result.ok) {
    return json({ error: result.reason ?? "Cancellation failed" }, 409);
  }
  return json(
    {
      ok: true,
      refunded: result.refunded,
      insideWindow: result.insideWindow,
      // When the Stripe refund failed, expose it so admin UI can flag that
      // the booking cancelled without returning the money. The booking IS
      // cancelled in the DB regardless — this is for staff visibility.
      refundError: result.refundError,
    },
    200,
  );
};
