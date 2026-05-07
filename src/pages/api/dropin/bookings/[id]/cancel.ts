/**
 * POST /api/dropin/bookings/:id/cancel
 *
 * Customer-facing cancel: only the booking owner may call. Refund-eligibility
 * follows the org's cancel-window policy (no admin override here).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings } from "@/lib/db/schema/drop-in";
import { processCancelRefund } from "@/lib/dropin/refund";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const id = params.id;
  if (!id) return json({ error: "Booking id required" }, 400);

  const db = getDb();
  const [row] = await db
    .select()
    .from(dropInBookings)
    .where(eq(dropInBookings.id, id))
    .limit(1);
  if (!row) return json({ error: "Booking not found" }, 404);
  if (row.userId !== locals.user.id) {
    return json({ error: "Not your booking" }, 403);
  }

  const result = await processCancelRefund(id, { adminOverride: false });
  if (!result.ok) {
    return json({ error: result.reason ?? "Cancellation failed" }, 409);
  }
  return json(
    {
      ok: true,
      refunded: result.refunded,
      insideWindow: result.insideWindow,
    },
    200,
  );
};
