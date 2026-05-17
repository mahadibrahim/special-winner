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
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { assertNoRentalConflict } from "./conflicts";

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

export async function createRentalHold(
  input: RentalHoldInput,
): Promise<RentalHoldResult> {
  const db = getDb();
  return await db.transaction(async (tx) => {
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
}

export interface ConfirmedRentalInput
  extends Omit<RentalHoldInput, "paymentMethod"> {
  paymentMethod: "cash" | "comp";
}

export async function createConfirmedRentalNonStripe(
  input: ConfirmedRentalInput,
): Promise<RentalHoldResult> {
  const db = getDb();
  return await db.transaction(async (tx) => {
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
}
