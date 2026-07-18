/**
 * POST /api/admin/rentals/:id/players/:playerId/resend → staff-triggered
 * re-send of the waiver-invite email for a still-pending roster player.
 * Mirrors the renter-owned resend at
 * /api/rentals/bookings/:id/players/:playerId/resend, but gated by
 * requireOrgAdminAccess + callerCanActOnVenue instead of renterUserId — an
 * admin caller never owns the rental, so the renter-owned endpoint can't be
 * reused here. `mintToken` reuses an existing unconsumed token rather than
 * minting a new one, so this is safe to call repeatedly.
 *
 * Org- AND location-scoped: a venue manager can only resend for rentals
 * whose venue is in their assigned locations (super-admin is unscoped).
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { mintToken } from "@/lib/check-in/tokens-db";
import { dispatchPlayerWaiverInvite } from "@/lib/rentals/messages/player-waiver";
import { RENTAL_PLAYER_TOKEN_TTL_HOURS } from "@/lib/rentals/players";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;
  const rentalId = context.params.id;
  const playerId = context.params.playerId;
  if (!rentalId || !playerId) {
    return json({ error: "rental id and player id required" }, 400);
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

  const [player] = await db
    .select()
    .from(fieldRentalPlayers)
    .where(
      and(eq(fieldRentalPlayers.id, playerId), eq(fieldRentalPlayers.rentalId, rentalId)),
    )
    .limit(1);
  if (!player) return json({ error: "Player not found" }, 404);
  if (player.status !== "pending") {
    return json({ error: "Player has already signed" }, 422);
  }

  await mintToken({
    kind: "rental_player",
    targetId: player.id,
    organizationId: rental.organizationId,
    venueId: rental.venueId,
    sentVia: "email",
    recipientUserId: null,
    recipientEmail: player.signerEmail,
    recipientPhone: null,
    createdByUserId: context.locals.user!.id,
    ttlHours: RENTAL_PLAYER_TOKEN_TTL_HOURS,
  });

  await dispatchPlayerWaiverInvite(player.id).catch((e) =>
    console.error("[admin/rentals] player waiver resend dispatch failed", e),
  );

  return json({ resent: true }, 200);
};
