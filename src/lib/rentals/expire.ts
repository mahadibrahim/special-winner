/**
 * Sweep `pending_payment` field-rental rows whose `payment_expires_at` has
 * passed and mark them cancelled, freeing the field. Mirrors the drop-in
 * `expireOverduePromotions` sweep.
 */
import { and, eq, lt, isNotNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { removeSourceBlock } from "@/lib/scheduling/blocks";

export async function expirePendingRentals(): Promise<{ expired: number }> {
  const now = new Date();
  const rows = await getDb()
    .update(fieldRentals)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "user_request",
      updatedAt: now,
    })
    .where(
      and(
        eq(fieldRentals.status, "pending_payment"),
        isNotNull(fieldRentals.paymentExpiresAt),
        lt(fieldRentals.paymentExpiresAt, now),
      ),
    )
    .returning({ id: fieldRentals.id });

  // Free the field-time-ledger blocks for the expired holds. (The
  // scheduling library also treats expired hold-blocks as free, so a
  // missed sweep can't squat on a slot — this is the tidy-up.)
  for (const row of rows) {
    await removeSourceBlock("rental", row.id);
  }
  return { expired: rows.length };
}

/**
 * Sweep `requested` rows whose `request_expires_at` has passed — an admin
 * never approved/declined them — and cancel them, freeing the field. Mirrors
 * expirePendingRentals but keyed on requestExpiresAt / status='requested'.
 */
export async function expireStaleRentalRequests(): Promise<{
  expired: number;
}> {
  const now = new Date();
  const rows = await getDb()
    .update(fieldRentals)
    .set({
      status: "cancelled",
      cancelledAt: now,
      cancellationReason: "venue_unavailable",
      requestExpiresAt: null,
      updatedAt: now,
    })
    .where(
      and(
        eq(fieldRentals.status, "requested"),
        isNotNull(fieldRentals.requestExpiresAt),
        lt(fieldRentals.requestExpiresAt, now),
      ),
    )
    .returning({ id: fieldRentals.id });

  for (const row of rows) {
    await removeSourceBlock("rental", row.id);
  }
  return { expired: rows.length };
}
