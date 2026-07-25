/**
 * POST /api/rentals/bookings/:id/pay
 *
 * Mints a fresh Stripe Checkout Session for an APPROVED rental
 * (status `pending_payment`) owned by the signed-in renter. Minting on
 * demand (rather than at approval time) avoids Stripe-session-expiry — the
 * approval email just links here. The existing checkout.session.completed
 * webhook flips the row to `confirmed`.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals } from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import { collectAdAttribution } from "@/lib/analytics/parse-cookies";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, locals, url, request }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);
  const rentalId = params.id;
  if (!rentalId) return json({ error: "rental id required" }, 400);

  const db = getDb();
  const [row] = await db
    .select({ rental: fieldRentals, venue: venues })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.id, rentalId))
    .limit(1);
  if (!row?.rental) return json({ error: "Rental not found" }, 404);
  const { rental, venue } = row;

  if (rental.renterUserId !== locals.user.id) {
    return json({ error: "Not your rental" }, 403);
  }
  if (rental.status !== "pending_payment") {
    return json({ error: "Rental is not awaiting payment" }, 422);
  }
  if (!stripe) return json({ error: "Stripe not configured" }, 500);

  const partnerStripeAccountId = venue?.partnerStripeAccountId ?? null;
  const applicationFeePct = venue?.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((rental.amountDueCents * applicationFeePct) / 100)
    : undefined;
  const appUrl = url.origin;

  try {
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: locals.user.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Field rental — ${venue?.name ?? "Facility"}`,
                description: `Field ${rental.fieldNumber}, ${rental.startsAt.toISOString()}`,
              },
              unit_amount: rental.amountDueCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "field_rental",
          rental_id: rental.id,
          organization_id: rental.organizationId,
          base_amount_cents: String(rental.amountDueCents),
          brand: rental.brand,
          user_id: locals.user.id,
          venue_name: venue?.name ?? "",
          ...collectAdAttribution(url, request.headers.get("cookie")),
        },
        payment_intent_data: partnerStripeAccountId
          ? {
              application_fee_amount: applicationFeeCents,
              transfer_data: { destination: partnerStripeAccountId },
            }
          : undefined,
        success_url: `${appUrl}/dashboard/bookings?rental=success`,
        cancel_url: `${appUrl}/dashboard/bookings?rental=cancelled`,
      },
      { idempotencyKey: `${rental.id}:rental-pay:${rental.amountDueCents}` },
    );
    return json({ checkoutUrl: session.url }, 200);
  } catch (err) {
    console.error("[rentals] pay checkout session create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
