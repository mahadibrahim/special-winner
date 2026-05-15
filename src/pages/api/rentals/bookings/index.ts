/**
 * GET  /api/rentals/bookings → the authenticated user's field rentals.
 * POST /api/rentals/bookings → create a rental.
 *   - comp/$0 path: insert a confirmed row immediately.
 *   - paid path: insert a `pending_payment` hold, create a Stripe Checkout
 *     Session (Connect-aware), return the URL. The webhook flips the row to
 *     `confirmed`.
 *
 * Mirrors src/pages/api/dropin/bookings/index.ts.
 */
import type { APIRoute } from "astro";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  fieldRentals,
  fieldRentalRateCard,
} from "@/lib/db/schema/field-rentals";
import { venues } from "@/lib/db/schema/teams";
import { stripe } from "@/lib/stripe/client";
import {
  resolveRentalHourlyRateCents,
  computeRentalPriceCents,
} from "@/lib/rentals/pricing";
import { validateRentalBookingRequest } from "@/lib/rentals/validators";
import {
  createRentalHold,
  createConfirmedRentalNonStripe,
} from "@/lib/rentals/booking";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async ({ locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  const db = getDb();
  const rows = await db
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      paymentStatus: fieldRentals.paymentStatus,
      amountDueCents: fieldRentals.amountDueCents,
      amountPaidCents: fieldRentals.amountPaidCents,
      partySize: fieldRentals.partySize,
      purpose: fieldRentals.purpose,
      checkedInAt: fieldRentals.checkedInAt,
      venueName: venues.name,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.renterUserId, locals.user.id))
    .orderBy(desc(fieldRentals.startsAt));

  return json({ rentals: rows }, 200);
};

export const POST: APIRoute = async ({ request, locals }) => {
  if (!locals.user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const validationError = validateRentalBookingRequest(body);
  if (validationError) return json({ error: validationError }, 422);

  const venueId = body.venueId as string;
  const fieldNumber = body.fieldNumber as number;
  const startsAt = new Date(body.startsAt as string);
  const endsAt = new Date(body.endsAt as string);
  const partySize = (body.partySize as number) ?? 1;
  const purpose = (body.purpose as string) ?? null;
  const waiverName = (body.waiverName as string).trim();

  const db = getDb();
  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue || !venue.rentalEnabled) {
    return json({ error: "Venue not found or rentals disabled" }, 404);
  }

  const orgId = locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  let [rateCard] = await db
    .select()
    .from(fieldRentalRateCard)
    .where(eq(fieldRentalRateCard.organizationId, orgId))
    .limit(1);
  if (!rateCard) {
    await db
      .insert(fieldRentalRateCard)
      .values({ organizationId: orgId })
      .onConflictDoNothing();
    [rateCard] = await db
      .select()
      .from(fieldRentalRateCard)
      .where(eq(fieldRentalRateCard.organizationId, orgId))
      .limit(1);
  }

  const durationMinutes = (endsAt.getTime() - startsAt.getTime()) / 60_000;
  if (durationMinutes < rateCard.minDurationMinutes) {
    return json(
      { error: `Minimum rental is ${rateCard.minDurationMinutes} minutes` },
      422,
    );
  }
  if (durationMinutes > rateCard.maxDurationMinutes) {
    return json(
      { error: `Maximum rental is ${rateCard.maxDurationMinutes} minutes` },
      422,
    );
  }

  const hourlyRate = resolveRentalHourlyRateCents(
    venue.rentalHourlyRateCents,
    rateCard.defaultHourlyRateCents,
  );
  const amountDueCents = computeRentalPriceCents(startsAt, endsAt, hourlyRate);

  if (amountDueCents === 0) {
    const result = await createConfirmedRentalNonStripe({
      organizationId: orgId,
      venueId,
      fieldNumber,
      startsAt,
      endsAt,
      source: "online_booking",
      paymentMethod: "comp",
      amountDueCents: 0,
      renterUserId: locals.user.id,
      renterName: waiverName,
      renterEmail: locals.user.email,
      renterPhone: null,
      partySize,
      purpose,
      notes: null,
      createdByUserId: locals.user.id,
      waiverSigned: true,
      waiverSignedBy: waiverName,
    });
    if (!result.ok) return json({ error: result.error }, 409);
    return json({ paymentRequired: false, rentalId: result.rental.id }, 200);
  }

  // Run the conflict check + create the hold BEFORE checking Stripe so a
  // genuine 409 is reported even on environments without Stripe configured
  // (e.g. CI). If Stripe is missing we clean up the hold below.
  const hold = await createRentalHold({
    organizationId: orgId,
    venueId,
    fieldNumber,
    startsAt,
    endsAt,
    source: "online_booking",
    paymentMethod: "card_online",
    amountDueCents,
    renterUserId: locals.user.id,
    renterName: waiverName,
    renterEmail: locals.user.email,
    renterPhone: null,
    partySize,
    purpose,
    notes: null,
    createdByUserId: locals.user.id,
    waiverSigned: true,
    waiverSignedBy: waiverName,
  });
  if (!hold.ok) return json({ error: hold.error }, 409);

  if (!stripe) {
    // Stripe missing — release the hold and surface the misconfig.
    await db.delete(fieldRentals).where(eq(fieldRentals.id, hold.rental.id));
    return json({ error: "Stripe not configured" }, 500);
  }

  const partnerStripeAccountId = venue.partnerStripeAccountId ?? null;
  const applicationFeePct = venue.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((amountDueCents * applicationFeePct) / 100)
    : undefined;
  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  try {
    const checkoutSession = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: locals.user.email,
        line_items: [
          {
            price_data: {
              currency: "usd",
              product_data: {
                name: `Field rental — ${venue.name}`,
                description: `Field ${fieldNumber}, ${startsAt.toISOString()}`,
              },
              unit_amount: amountDueCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          type: "field_rental",
          rental_id: hold.rental.id,
          organization_id: orgId,
        },
        payment_intent_data: partnerStripeAccountId
          ? {
              application_fee_amount: applicationFeeCents,
              transfer_data: { destination: partnerStripeAccountId },
            }
          : undefined,
        success_url: `${appUrl}/dashboard/bookings?rental=success`,
        cancel_url: `${appUrl}/rentals?rental=cancelled`,
      },
      { idempotencyKey: `${hold.rental.id}:rental-checkout:${amountDueCents}` },
    );
    return json(
      {
        paymentRequired: true,
        checkoutUrl: checkoutSession.url,
        rentalId: hold.rental.id,
      },
      200,
    );
  } catch (err) {
    // Stripe call failed after the hold row was committed (no outer tx) — manually undo it to release the field.
    await db.delete(fieldRentals).where(eq(fieldRentals.id, hold.rental.id));
    console.error("[rentals] checkout session create failed", err);
    return json({ error: "Could not start checkout" }, 502);
  }
};
