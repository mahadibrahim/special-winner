/**
 * Claim-link helpers for guest field-rental bookings.
 *
 * A rental booked without a user account (`renterUserId` null) has no
 * dashboard to land on after approval/payment, so the approval and $0/comp
 * confirmation emails link to a claim page instead. Visiting the claim link
 * (after signing in / signing up) attaches the rental to the visiting user
 * via `claimRentalForUser`.
 */
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, type FieldRental } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";

const CLAIM_TTL_HOURS = 24 * 30; // must outlive the 24h pay window + reminders

export async function mintRentalClaimToken(rental: FieldRental): Promise<string> {
  const t = await mintToken({
    kind: "rental_claim",
    targetId: rental.id,
    organizationId: rental.organizationId,
    venueId: rental.venueId,
    sentVia: "email",
    recipientUserId: null,
    recipientEmail: rental.renterEmail,
    recipientPhone: rental.renterPhone,
    createdByUserId: null,
    ttlHours: CLAIM_TTL_HOURS,
  });
  return t.token;
}

/** Attach a still-unclaimed rental to a user. Returns false if already claimed. */
export async function claimRentalForUser(rentalId: string, userId: string): Promise<boolean> {
  const rows = await getDb()
    .update(fieldRentals)
    .set({ renterUserId: userId, updatedAt: new Date() })
    .where(and(eq(fieldRentals.id, rentalId), isNull(fieldRentals.renterUserId)))
    .returning({ id: fieldRentals.id });
  return rows.length > 0;
}
