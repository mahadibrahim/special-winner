/**
 * GET  /api/rentals/bookings/:id/players → the roster for a renter-owned
 *      field rental, plus a { signed, total } summary.
 * POST /api/rentals/bookings/:id/players → add a player to the roster.
 *      Mints a waiver token and emails the signer via createRentalPlayer.
 *      Rate-limited per rental so the roster can't be flooded.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalPlayers } from "@/lib/db/schema/field-rentals";
import { createRentalPlayer } from "@/lib/rentals/players";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function loadOwnedRental(rentalId: string, userId: string) {
  const [rental] = await getDb()
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!rental) return { rental: null, error: json({ error: "Rental not found" }, 404) };
  if (rental.renterUserId !== userId) {
    return { rental: null, error: json({ error: "Not your rental" }, 403) };
  }
  return { rental, error: null };
}

export const GET: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const { rental, error } = await loadOwnedRental(rentalId, locals.user.id);
  if (error) return error;

  const rows = await getDb()
    .select({
      id: fieldRentalPlayers.id,
      playerName: fieldRentalPlayers.playerName,
      isMinor: fieldRentalPlayers.isMinor,
      signerEmail: fieldRentalPlayers.signerEmail,
      status: fieldRentalPlayers.status,
      signedAt: fieldRentalPlayers.signedAt,
    })
    .from(fieldRentalPlayers)
    .where(eq(fieldRentalPlayers.rentalId, rental!.id));

  const signed = rows.filter((r) => r.status === "signed").length;
  return json({ players: rows, signed, total: rows.length }, 200);
};

export const POST: APIRoute = async ({ params, request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const limit = rateLimit(`rental-players:${rentalId}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  let body: { playerName?: string; signerEmail?: string; isMinor?: boolean };
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const playerName = (body.playerName ?? "").trim();
  if (!playerName) return json({ error: "playerName is required" }, 422);

  const signerEmail = (body.signerEmail ?? "").trim();
  if (!signerEmail || signerEmail.length > 320 || !EMAIL_RX.test(signerEmail)) {
    return json({ error: "signerEmail must be a valid email address" }, 422);
  }

  const { rental, error } = await loadOwnedRental(rentalId, locals.user.id);
  if (error) return error;

  const { id } = await createRentalPlayer({
    rental: rental!,
    playerName,
    signerEmail,
    isMinor: body.isMinor === true,
    createdByUserId: locals.user.id,
  });

  return json({ id }, 200);
};
