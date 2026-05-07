/**
 * POST /api/admin/dropin/sessions/:id/cancel
 *
 * Admin-cancels the session. Marks the session row cancelled, then for
 * every still-active booking runs the refund pipeline as an admin
 * override (full refund regardless of cancel-window).
 */
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
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

  let refunded = 0;
  for (const b of activeBookings) {
    const r = await processCancelRefund(b.id, {
      adminOverride: true,
      reason: body.reason ?? "session_cancelled",
    });
    if (r.refunded) refunded += 1;
  }

  await db
    .update(dropInSessions)
    .set({ status: "cancelled", updatedAt: new Date() })
    .where(eq(dropInSessions.id, id));

  return json(
    {
      ok: true,
      cancelledBookings: activeBookings.length,
      refundedBookings: refunded,
    },
    200,
  );
};
