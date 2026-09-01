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
 *
 * createRentalRequest: inserts a `requested` row that holds the slot without
 * a Stripe object — payment happens only after an admin approves.
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { assertNoRentalConflict } from "./conflicts";
import { BlockConflictError } from "@/lib/scheduling/blocks";
import { syncRentalBlock } from "@/lib/scheduling/sync";
import type { BrandId } from "@/lib/branding/themes";

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
  /**
   * Override for the row's `waiverSignedAt`. Omit (undefined) for the
   * default — "now" when `waiverSigned` is true, else null, unchanged from
   * before this field existed. Pass `null` explicitly for a derived
   * "on file" stamp: `hasValidLiabilityWaiver`'s legacy fallback only
   * accepts DATED signature rows, so a dated derived copy would let each
   * booking renew the very annual window it was derived from (mirrors
   * book-child.ts's on-file branch).
   */
  waiverSignedAt?: Date | null;
  brand?: BrandId;
}

export type RentalHoldResult =
  | { ok: true; rental: FieldRental }
  | { ok: false; error: string };

/** Shared by all three insert sites — see `RentalHoldInput.waiverSignedAt`. */
function resolveWaiverSignedAt(input: {
  waiverSigned: boolean;
  waiverSignedAt?: Date | null;
}): Date | null {
  if (!input.waiverSigned) return null;
  return input.waiverSignedAt !== undefined ? input.waiverSignedAt : new Date();
}

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
        waiverSignedAt: resolveWaiverSignedAt(input),
        waiverSignedBy: input.waiverSignedBy,
        brand: input.brand ?? "aspire",
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
        waiverSignedAt: resolveWaiverSignedAt(input),
        waiverSignedBy: input.waiverSignedBy,
        brand: input.brand ?? "aspire",
      })
      .returning();
    return { ok: true as const, rental };
  });
  return withLedgerSync(created);
}

export interface RentalRequestInput {
  organizationId: string;
  venueId: string;
  fieldNumber: number;
  startsAt: Date;
  endsAt: Date;
  amountDueCents: number;
  requestHoldHours: number;
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
  /** See `RentalHoldInput.waiverSignedAt`. */
  waiverSignedAt?: Date | null;
  brand?: BrandId;
}

/**
 * Insert a `requested` field rental after a conflict check. Holds the slot
 * (conflict check + ledger see `requested`) but is NOT swept by the
 * payment-expiry cron — a separate sweep releases it after requestHoldHours.
 * No Stripe object: payment happens only after an admin approves.
 */
export async function createRentalRequest(
  input: RentalRequestInput,
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
        status: "requested",
        source: "online_booking",
        // Free requests confirm as comp on approval; paid as card_online.
        paymentMethod: input.amountDueCents === 0 ? "comp" : "card_online",
        amountDueCents: input.amountDueCents,
        amountPaidCents: 0,
        paymentStatus: "unpaid",
        requestExpiresAt: new Date(
          Date.now() + input.requestHoldHours * 60 * 60_000,
        ),
        renterUserId: input.renterUserId,
        renterName: input.renterName,
        renterEmail: input.renterEmail,
        renterPhone: input.renterPhone,
        partySize: input.partySize,
        purpose: input.purpose,
        notes: input.notes,
        createdByUserId: input.createdByUserId,
        waiverSigned: input.waiverSigned,
        waiverSignedAt: resolveWaiverSignedAt(input),
        waiverSignedBy: input.waiverSignedBy,
        brand: input.brand ?? "aspire",
      })
      .returning();
    return { ok: true as const, rental };
  });
  return withLedgerSync(created);
}
