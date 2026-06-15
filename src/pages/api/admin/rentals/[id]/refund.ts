// TODO(SP2b): location-scope write — POST does not yet verify rental's venue.locationId ∈ caller's locations.
/**
 * POST /api/admin/rentals/:id/refund → refund + cancel a paid rental.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { requireAdminAccess } from "@/lib/auth/roles";
import { refundFieldRental } from "@/lib/rentals/refund";

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
  const rentalId = context.params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const [rental] = await getDb()
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental || rental.organizationId !== orgId) {
    return json({ error: "Rental not found" }, 404);
  }

  const result = await refundFieldRental(rentalId, "admin_override");
  if (!result.ok) {
    if (result.error === "Rental not found") return json({ error: result.error }, 404);
    if (result.error === "Rental already cancelled") return json({ error: result.error }, 409);
    if (result.error === "Stripe not configured") return json({ error: result.error }, 503);
    return json({ error: result.error }, 502);
  }
  return json({ rental: result.rental }, 200);
};
