/**
 * Booking orchestration for field rentals.
 *
 * createRentalHold: inserts a `pending_payment` row inside a transaction
 * after a conflict check, holding the field for `holdMinutes`. Used by the
 * customer online flow and the admin card_present flow — the Stripe object
 * is created by the caller after this returns, and the webhook flips the
 * row to `confirmed`.
 *
 * createConfirmedRentalNonStripe: inserts a `confirmed` row directly for
 * cash/comp admin bookings (no Stripe object).
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { assertNoRentalConflict } from "./conflicts";
import { BlockConflictError } from "@/lib/scheduling/blocks";
import { syncRentalBlock } from "@/lib/scheduling/sync";

// Window the field is held for the customer after they POST the booking
// and before Stripe Checkout confirms. Short enough that an abandoned
// checkout doesn't tie up an evening slot for long; long enough for a
// normal Stripe flow (avg ~2-3 min) including a 3DS challenge.
// Follow-up: move this to fieldRentalRateCard so it's per-org configurable.
const HOLD_MINUTES = 10;

export interface RentalHoldInput {
  organizationId: string;
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
  source: "online_booking" | "admin_created";
  paymentMethod: "card_online" | "card_present";
  amountDueCents: number;
  renterUserId: string | null;
  renterName: string;
  renterEmail: string | null;
  renterPhone: string | null;
  partySize: number;
  purpose: string | null;
  notes: string | null;
  createdByUserId: string | null;
  waiverSigned: boolean;
  waiverSignedBy: string | null;
}

export type RentalHoldResult =
  | { ok: true; rental: FieldRental }
  | { ok: false; error: string };

/**
 * Write the rental's field-time-ledger block after creation. A ledger
 * conflict (e.g. an external Good Rec hold the rentals conflict check
 * can't see) cancels the just-created rental and converts to ok:false —
 * the customer sees the same 409 path as a plain rental conflict.
 */
async function withLedgerSync(result: RentalHoldResult): Promise<RentalHoldResult> {
  if (!result.ok) return result;
  try {
    await syncRentalBlock(result.rental.id);
    return result;
  } catch (err) {
    if (err instanceof BlockConflictError) {
      await getDb()
        .update(fieldRentals)
        .set({ status: "cancelled", updatedAt: new Date() })
        .where(eq(fieldRentals.id, result.rental.id));
      return { ok: false, error: err.message };
    }
    throw err;
  }
}

export async function createRentalHold(
  input: RentalHoldInput,
): Promise<RentalHoldResult> {
  const db = getDb();
  const created = await db.transaction(async (tx) => {
    const conflict = await assertNoRentalConflict(tx, {
      venueId: input.venueId,
      fieldNumber: input.fieldNumber,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    if (conflict) return { ok: false as const, error: conflict };

    const [rental] = await tx
      .insert(fieldRentals)
      .values({
        organizationId: input.organizationId,
        venueId: input.venueId,
        fieldNumber: input.fieldNumber,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "pending_payment",
        source: input.source,
        paymentMethod: input.paymentMethod,
        amountDueCents: input.amountDueCents,
        amountPaidCents: 0,
        paymentStatus: "unpaid",
        paymentExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
        renterUserId: input.renterUserId,
        renterName: input.renterName,
        renterEmail: input.renterEmail,
        renterPhone: input.renterPhone,
        partySize: input.partySize,
        purpose: input.purpose,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
        waiverSigned: input.waiverSigned,
        waiverSignedAt: input.waiverSigned ? new Date() : null,
        waiverSignedBy: input.waiverSignedBy,
      })
      .returning();
    return { ok: true as const, rental };
  });
  return withLedgerSync(created);
}

export interface ConfirmedRentalInput
  extends Omit<RentalHoldInput, "paymentMethod"> {
  paymentMethod: "cash" | "comp";
}

export async function createConfirmedRentalNonStripe(
  input: ConfirmedRentalInput,
): Promise<RentalHoldResult> {
  const db = getDb();
  const created = await db.transaction(async (tx) => {
    const conflict = await assertNoRentalConflict(tx, {
      venueId: input.venueId,
      fieldNumber: input.fieldNumber,
      startsAt: input.startsAt,
      endsAt: input.endsAt,
    });
    if (conflict) return { ok: false as const, error: conflict };

    const [rental] = await tx
      .insert(fieldRentals)
      .values({
        organizationId: input.organizationId,
        venueId: input.venueId,
        fieldNumber: input.fieldNumber,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        status: "confirmed",
        source: input.source,
        paymentMethod: input.paymentMethod,
        amountDueCents: input.amountDueCents,
        amountPaidCents:
          input.paymentMethod === "cash" ? input.amountDueCents : 0,
        paymentStatus: "paid",
        renterUserId: input.renterUserId,
        renterName: input.renterName,
        renterEmail: input.renterEmail,
        renterPhone: input.renterPhone,
        partySize: input.partySize,
        purpose: input.purpose,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
        waiverSigned: input.waiverSigned,
        waiverSignedAt: input.waiverSigned ? new Date() : null,
        waiverSignedBy: input.waiverSignedBy,
      })
      .returning();
    return { ok: true as const, rental };
  });
  return withLedgerSync(created);
}
