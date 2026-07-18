/**
 * POST /api/rentals/bookings/:id/players/:playerId/resend → re-send the
 * waiver-invite email for a still-pending roster player. `mintToken` reuses
 * an existing unconsumed token rather than minting a new one, so this is
 * safe to call repeatedly. Renter-owned; rate-limited per rental.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { mintToken } from "@/lib/check-in/tokens-db";
import { dispatchPlayerWaiverInvite } from "@/lib/rentals/messages/player-waiver";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  const playerId = params.playerId;
  if (!rentalId || !playerId) return json({ error: "rental id and player id required" }, 400);

  const limit = rateLimit(`rental-players:${rentalId}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental) return json({ error: "Rental not found" }, 404);
  if (rental.renterUserId !== locals.user.id) {
    return json({ error: "Not your rental" }, 403);
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
    createdByUserId: locals.user.id,
  });

  await dispatchPlayerWaiverInvite(player.id).catch((e) =>
    console.error("[rentals] player waiver resend dispatch failed", e),
  );

  return json({ resent: true }, 200);
};
