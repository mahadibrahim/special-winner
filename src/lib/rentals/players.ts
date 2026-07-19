/**
 * `createRentalPlayer` — the one path that should ever add a roster row to a
 * field rental: inserts the `field_rental_players` row, mints a
 * `rental_player` self-serve token for it, and dispatches the waiver-invite
 * email. Used by the renter-facing roster POST endpoint. (The admin
 * approve-hook in `src/pages/api/admin/rentals/[id].ts` inserts the
 * requester directly — that row is already signed and needs no invite.)
 */
import { fieldRentalPlayers, type FieldRental } from "@/lib/db/schema/field-rentals";
import { getDb } from "@/lib/db";
import { mintToken } from "@/lib/check-in/tokens-db";
import { dispatchPlayerWaiverInvite } from "@/lib/rentals/messages/player-waiver";

/**
 * `rental_player` self-serve tokens can't use `mintToken`'s 6h default TTL:
 * rentals are booked up to ~7 days out, players sign the waiver over that
 * span, and reminders fire at 24h. A 6h TTL would expire the invite link
 * (and the reminder link) long before the booking happens.
 */
export const RENTAL_PLAYER_TOKEN_TTL_HOURS = 24 * 30;

export interface CreateRentalPlayerInput {
  rental: FieldRental;
  playerName: string;
  signerEmail: string;
  isMinor: boolean;
  createdByUserId: string | null;
}

export async function createRentalPlayer(
  input: CreateRentalPlayerInput,
): Promise<{ id: string }> {
  const db = getDb();
  const [row] = await db
    .insert(fieldRentalPlayers)
    .values({
      rentalId: input.rental.id,
      playerName: input.playerName,
      signerEmail: input.signerEmail,
      isMinor: input.isMinor,
      status: "pending",
    })
    .returning();

  await mintToken({
    kind: "rental_player",
    targetId: row.id,
    organizationId: input.rental.organizationId,
    venueId: input.rental.venueId,
    sentVia: "email",
    recipientUserId: null,
    recipientEmail: input.signerEmail,
    recipientPhone: null,
    createdByUserId: input.createdByUserId,
    ttlHours: RENTAL_PLAYER_TOKEN_TTL_HOURS,
  });

  await dispatchPlayerWaiverInvite(row.id).catch((e) =>
    console.error("[rentals] player waiver invite dispatch failed", e),
  );

  return { id: row.id };
}
