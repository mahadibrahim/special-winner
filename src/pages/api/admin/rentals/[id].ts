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
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { assertNoRentalConflict } from "@/lib/rentals/conflicts";
import { BlockConflictError, removeSourceBlock } from "@/lib/scheduling/blocks";
import { syncRentalBlock } from "@/lib/scheduling/sync";
import { zonedHourToUtc } from "@/lib/activity-tracking/tz-day";
import {
  dispatchRentalConfirmation,
  dispatchRentalRequestApproved,
  dispatchRentalRequestDeclined,
} from "@/lib/rentals/messages/dispatch";
import { addRequesterAsSignedPlayer } from "@/lib/rentals/players";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * Auto-add the requester as player #1 on approve — they accepted the waiver
 * at request time, so record them as already signed (no invite email). Only
 * fires for an online-booked (renterUserId-bearing) rental; a GUEST rental
 * has a null renterUserId at approval and instead gets its requester added
 * when the guest claims (the shared helper is also called from the claim
 * endpoint). The shared helper's own existence-check + onConflictDoNothing
 * guard against a double-click re-running approve, or a resend/webhook race.
 */
async function autoAddRequesterAsPlayer(rental: typeof fieldRentals.$inferSelect) {
  if (!rental.renterUserId) return;
  await addRequesterAsSignedPlayer(rental);
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
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

  // Roster is read-only from this admin surface — the renter-owned
  // GET /api/rentals/bookings/:id/players checks renterUserId, which an
  // admin caller never satisfies, so the roster rides along in this
  // response instead of a separate admin players endpoint.
  const playerRows = await getDb()
    .select({
      id: fieldRentalPlayers.id,
      playerName: fieldRentalPlayers.playerName,
      isMinor: fieldRentalPlayers.isMinor,
      signerEmail: fieldRentalPlayers.signerEmail,
      status: fieldRentalPlayers.status,
      signedAt: fieldRentalPlayers.signedAt,
    })
    .from(fieldRentalPlayers)
    .where(eq(fieldRentalPlayers.rentalId, rentalId));
  const playersSigned = playerRows.filter((p) => p.status === "signed").length;

  return json(
    {
      rental: row.field_rentals,
      venue: row.venues,
      players: playerRows,
      playersSigned,
      playersTotal: playerRows.length,
    },
    200,
  );
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  const rentalId = context.params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  let body: {
    notes?: string;
    purpose?: string;
    cancel?: boolean;
    approve?: boolean;
    decline?: boolean;
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

  // --- approve / decline a requested rental ---
  if (body.approve === true || body.decline === true) {
    if (rental.status !== "requested") {
      return json({ error: "Only requested rentals can be approved or declined" }, 422);
    }

    if (body.decline === true) {
      const [updated] = await db
        .update(fieldRentals)
        .set({
          status: "cancelled",
          cancelledAt: new Date(),
          cancellationReason: "venue_unavailable",
          requestExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(fieldRentals.id, rentalId))
        .returning();
      await removeSourceBlock("rental", rentalId);
      await dispatchRentalRequestDeclined(rentalId).catch((e) =>
        console.error("[rentals] decline dispatch failed", e),
      );
      return json({ rental: updated }, 200);
    }

    // approve
    if (rental.amountDueCents === 0) {
      const [updated] = await db
        .update(fieldRentals)
        .set({
          status: "confirmed",
          paymentMethod: "comp",
          paymentStatus: "paid",
          requestExpiresAt: null,
          updatedAt: new Date(),
        })
        .where(eq(fieldRentals.id, rentalId))
        .returning();
      await syncRentalBlock(rentalId);
      await autoAddRequesterAsPlayer(rental);
      await dispatchRentalConfirmation(rentalId).catch((e) =>
        console.error("[rentals] confirm dispatch failed", e),
      );
      return json({ rental: updated }, 200);
    }

    const [updated] = await db
      .update(fieldRentals)
      .set({
        status: "pending_payment",
        paymentMethod: "card_online",
        requestExpiresAt: null,
        paymentExpiresAt: new Date(Date.now() + 24 * 60 * 60_000),
        updatedAt: new Date(),
      })
      .where(eq(fieldRentals.id, rentalId))
      .returning();
    // Refresh the ledger block so its expiry tracks the 24h pay window.
    await syncRentalBlock(rentalId);
    await autoAddRequesterAsPlayer(rental);
    await dispatchRentalRequestApproved(rentalId).catch((e) =>
      console.error("[rentals] approve dispatch failed", e),
    );
    return json({ rental: updated }, 200);
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
        // The rental row was already committed at the new time, but the ledger
        // rejected the move (a drop-in/external/maintenance block occupies the
        // slot — assertNoRentalConflict can't see those). Revert the row so we
        // never leave a committed-but-unsynced rental (double-book hole). The
        // ledger block was never mutated (the upsert was rejected), so
        // reverting the row alone restores full consistency.
        await db
          .update(fieldRentals)
          .set({ startsAt: rental.startsAt, endsAt: rental.endsAt, updatedAt: new Date() })
          .where(eq(fieldRentals.id, rentalId));
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
