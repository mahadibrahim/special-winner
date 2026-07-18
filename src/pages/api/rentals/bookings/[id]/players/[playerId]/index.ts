/**
 * DELETE /api/rentals/bookings/:id/players/:playerId → remove a roster
 * player. Renter-owned; only a still-`pending` (unsigned) row may be
 * removed — a signed waiver is a record, not a draft.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const DELETE: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  const playerId = params.playerId;
  if (!rentalId || !playerId) return json({ error: "rental id and player id required" }, 400);

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
    return json({ error: "Only a pending player can be removed" }, 422);
  }

  await db.delete(fieldRentalPlayers).where(eq(fieldRentalPlayers.id, playerId));
  return json({ removed: true }, 200);
};
