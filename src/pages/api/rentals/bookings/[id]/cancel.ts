/**
 * POST /api/rentals/bookings/:id/cancel
 *
 * The renter cancels their own rental. Allowed only outside the rate
 * card's cancelWindowHours before `startsAt`. Issues a refund if paid.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { refundFieldRental } from "@/lib/rentals/refund";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const db = getDb();
  const [rental] = await db
    .select()
    .from(fieldRentals)
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  // 404 (not 403) for "not yours" — do not leak existence.
  if (!rental || rental.renterUserId !== locals.user.id) {
    return json({ error: "Rental not found" }, 404);
  }
  if (rental.status === "cancelled") {
    return json({ error: "Rental already cancelled" }, 409);
  }

  const [rateCard] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, rental.organizationId))
    .limit(1);
  const cancelWindowHours = rateCard?.cancelWindowHours ?? 24;
  const cutoff = new Date(
    rental.startsAt.getTime() - cancelWindowHours * 60 * 60 * 1000,
  );
  if (new Date() > cutoff) {
    return json(
      {
        error: `Rentals can only be cancelled more than ${cancelWindowHours} hours before the start time.`,
      },
      422,
    );
  }

  const result = await refundFieldRental(rentalId, "user_request");
  if (!result.ok) return json({ error: result.error }, 502);
  return json({ rental: result.rental }, 200);
};
