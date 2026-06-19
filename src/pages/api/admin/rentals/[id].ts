/**
 * GET   /api/admin/rentals/:id → full rental detail.
 * PATCH /api/admin/rentals/:id → update notes/purpose; cancel (without
 *        refund — use /refund for paid rentals); or reschedule:
 *        Body: { notes?, purpose?, cancel?: boolean,
 *                reschedule?: { date: "YYYY-MM-DD", startHour: number, durationMinutes: number } }
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
import { assertNoRentalConflict } from "@/lib/rentals/conflicts";
import { BlockConflictError } from "@/lib/scheduling/blocks";
import { syncRentalBlock } from "@/lib/scheduling/sync";
import { zonedHourToUtc } from "@/lib/activity-tracking/tz-day";

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

  let body: {
    notes?: string;
    purpose?: string;
    cancel?: boolean;
    reschedule?: { date: string; startHour: number; durationMinutes: number };
  };
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

  // --- reschedule action (conflict-checked + ledger re-sync) ---
  if (body.reschedule) {
    const { date, startHour, durationMinutes } = body.reschedule;

    // Validate date: must match YYYY-MM-DD AND be a real calendar date.
    if (
      typeof date !== "string" ||
      !date.match(/^\d{4}-\d{2}-\d{2}$/) ||
      Number.isNaN(new Date(`${date}T00:00:00.000Z`).getTime())
    ) {
      return json(
        { error: "reschedule.date must be a valid calendar date (YYYY-MM-DD)" },
        400,
      );
    }

    // Validate startHour: must be a whole integer 0–23.
    if (
      typeof startHour !== "number" ||
      !Number.isInteger(startHour) ||
      startHour < 0 ||
      startHour > 23
    ) {
      return json(
        { error: "reschedule.startHour must be a whole-number integer between 0 and 23" },
        400,
      );
    }

    // Validate durationMinutes: whole-hour multiples only, 60–240.
    if (
      typeof durationMinutes !== "number" ||
      !Number.isInteger(durationMinutes) ||
      durationMinutes < 60 ||
      durationMinutes > 240 ||
      durationMinutes % 60 !== 0
    ) {
      return json(
        { error: "reschedule.durationMinutes must be a whole-hour multiple (60, 120, 180, or 240)" },
        400,
      );
    }

    // Status guard: only active rentals may be rescheduled.
    if (rental.status !== "pending_payment" && rental.status !== "confirmed") {
      return json({ error: "Only active rentals can be rescheduled" }, 422);
    }

    const orgTz = context.locals.organization?.timezone ?? "America/New_York";
    const newStartsAt = zonedHourToUtc(date, startHour, orgTz);
    const newEndsAt = new Date(newStartsAt.getTime() + durationMinutes * 60_000);

    // Conflict check inside a transaction, excluding this rental's own block.
    let conflictMsg: string | null = null;
    let rescheduled: typeof rental | undefined;
    try {
      rescheduled = await db.transaction(async (tx) => {
        conflictMsg = await assertNoRentalConflict(tx, {
          venueId: rental.venueId,
          fieldNumber: rental.fieldNumber,
          startsAt: newStartsAt,
          endsAt: newEndsAt,
          excludeRentalId: rentalId,
        });
        if (conflictMsg) return undefined as unknown as typeof rental;

        const [row] = await tx
          .update(fieldRentals)
          .set({ startsAt: newStartsAt, endsAt: newEndsAt, updatedAt: new Date() })
          .where(eq(fieldRentals.id, rentalId))
          .returning();
        return row;
      });
    } catch {
      return json({ error: "Database error during reschedule" }, 500);
    }

    if (conflictMsg) {
      return json({ error: conflictMsg }, 409);
    }
    if (!rescheduled) {
      return json({ error: "Reschedule failed" }, 500);
    }

    // Re-sync the ledger block to reflect the new window.
    // Mirror booking.ts's withLedgerSync pattern: BlockConflictError → 409;
    // unexpected errors re-throw rather than swallowing a committed-but-unsynced state.
    try {
      await syncRentalBlock(rentalId);
    } catch (err) {
      if (err instanceof BlockConflictError) {
        return json({ error: `Ledger conflict: ${err.message}` }, 409);
      }
      throw err;
    }

    return json({ rental: rescheduled }, 200);
  }

  // --- standard notes/purpose/cancel mutations ---
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
