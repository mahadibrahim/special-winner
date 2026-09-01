/**
 * `createRentalPlayer` — the one path that should ever add a roster row to a
 * field rental: inserts the `field_rental_players` row, mints a
 * `rental_player` self-serve token for it, and dispatches the waiver-invite
 * email. Used by the renter-facing roster POST endpoint. (The admin
 * approve-hook in `src/pages/api/admin/rentals/[id].ts` inserts the
 * requester directly — that row is already signed and needs no invite.)
 */
import { eq } from "drizzle-orm";
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

/**
 * LIMITATION (annual-waiver unification, Task 6): an invited player is NOT
 * auto-marked signed even when `signerEmail` happens to match a person who
 * already carries a valid annual liability waiver. `field_rental_players`
 * has no `userId`/`family_members` linkage — only a typed `playerName` +
 * `signerEmail` (see the table definition in
 * src/lib/db/schema/field-rentals.ts) — so there is no reliable person to
 * consult `hasValidLiabilityWaiver` about. Matching on email alone was
 * considered and rejected: an email string is not a verified identity, and
 * a false match would silently skip a real signature requirement for
 * someone else's release. The renter's OWN roster row is the one exception
 * — `addRequesterAsSignedPlayer` below signs it directly from the RENTAL's
 * own (now annual-waiver-aware) `waiverSigned`/`waiverSignedBy` columns,
 * because that identity is never in doubt: it's the same account that just
 * booked. If `field_rental_players` ever gains a real linkage (e.g. an
 * account claim flow for invited players), this is the function to revisit.
 */
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

/**
 * Add the requester as roster player #1, already `signed` (they accepted the
 * waiver at request time, so no invite email). Idempotent: skips when any
 * roster row already exists for the rental, and `.onConflictDoNothing()`
 * guards the residual insert race.
 *
 * Two call sites converge here:
 *   - admin approve-hook — for an ONLINE-booked (signed-in) rental, which
 *     already has `renterUserId` at approval time.
 *   - the guest claim endpoint — a guest rental's `renterUserId` is null at
 *     approval (so the approve-hook skips it); this runs once the guest
 *     claims, so their booking isn't left with an empty roster.
 * The renter fields it reads (renterName/renterEmail/waiverSignedBy/
 * waiverSignedAt) don't change on claim, so either caller produces the same row.
 */
export async function addRequesterAsSignedPlayer(
  rental: FieldRental,
): Promise<void> {
  const db = getDb();
  const [existing] = await db
    .select({ id: fieldRentalPlayers.id })
    .from(fieldRentalPlayers)
    .where(eq(fieldRentalPlayers.rentalId, rental.id))
    .limit(1);
  if (existing) return;
  await db
    .insert(fieldRentalPlayers)
    .values({
      rentalId: rental.id,
      playerName: rental.renterName,
      signerEmail: rental.renterEmail ?? "",
      isMinor: false,
      status: "signed",
      signerName: rental.waiverSignedBy ?? rental.renterName,
      signedAt: rental.waiverSignedAt ?? new Date(),
    })
    .onConflictDoNothing();
}
