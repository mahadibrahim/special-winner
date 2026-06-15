/**
 * GET   /api/admin/rentals/:id → full rental detail.
 * PATCH /api/admin/rentals/:id → update notes/purpose, or cancel (without
 *        refund — use /refund for paid rentals). Body: { notes?, purpose?,
 *        cancel?: boolean }.
 *
 * Org- AND location-scoped: a venue manager can only read or mutate rentals
 * whose venue is in their assigned locations (super-admin is unscoped).
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { requireAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const rentalId = context.params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const [row] = await getDb()
    .select()
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!row || row.field_rentals.organizationId !== orgId) {
    return json({ error: "Rental not found" }, 404);
  }
  if (!(await callerCanActOnVenue(context, row.field_rentals.venueId))) {
    return json({ error: "Rental not found" }, 404);
  }
  return json({ rental: row.field_rentals, venue: row.venues }, 200);
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);
  const rentalId = context.params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  let body: { notes?: string; purpose?: string; cancel?: boolean };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental || rental.organizationId !== orgId) {
    return json({ error: "Rental not found" }, 404);
  }
  if (!(await callerCanActOnVenue(context, rental.venueId))) {
    return json({ error: "Rental not found" }, 404);
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.purpose !== undefined) updates.purpose = body.purpose;
  if (body.cancel === true) {
    if (rental.paymentStatus === "paid" && rental.amountPaidCents > 0) {
      return json(
        { error: "Paid rental — use POST /api/admin/rentals/:id/refund" },
        422,
      );
    }
    updates.status = "cancelled";
    updates.cancelledAt = new Date();
    updates.cancellationReason = "admin_override";
  }

  const [updated] = await db
    .update(fieldRentals)
    .set(updates)
    .where(eq(fieldRentals.id, rentalId))
    .returning();
  return json({ rental: updated }, 200);
};
