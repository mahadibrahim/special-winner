/**
 * GET  /api/admin/rentals?venueId=&from=&to=&status= → filtered list.
 * POST /api/admin/rentals → admin-created rental (phone/walk-in).
 *   - cash/comp → confirmed immediately.
 *   - card_present → pending_payment hold + PaymentIntent (Terminal); the
 *     webhook confirms it. (Terminal client wiring is in the admin UI.)
 *   - card_online → confirmed row + (optional) emailed payment link; for v1
 *     we create a confirmed row with paymentStatus "unpaid" and surface it
 *     in the admin UI as "payment link pending" — link emailing is deferred.
 */
import type { APIRoute } from "astro";
import { and, eq, gte, lte, desc } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { fieldRentals, fieldRentalRateCard } from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { venues } from "@/lib/db/schema/teams";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import {
  requireSameOrgVenue,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { getEffectiveLocationIds } from "@/lib/admin/active-venue";
import { venueLocationCondition } from "@/lib/admin/location-scope-filter";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { validateAdminRentalCreate } from "@/lib/rentals/validators";
import { resolveRentalHourlyRateCents, computeRentalPriceCents } from "@/lib/rentals/pricing";
import { createRentalHold, createConfirmedRentalNonStripe } from "@/lib/rentals/booking";
import { stripe } from "@/lib/stripe/client";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const url = context.url;
  const venueId = url.searchParams.get("venueId");
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const status = url.searchParams.get("status");

  const locIds = await getEffectiveLocationIds({
    userId: context.locals.user!.id,
    userRoles: context.locals.userRoles ?? [],
    activeLocationId: context.locals.activeLocationId ?? null,
  });
  const scopeCond = venueLocationCondition(locIds);

  const conditions = [eq(fieldRentals.organizationId, orgId)];
  if (venueId) conditions.push(eq(fieldRentals.venueId, venueId));
  if (from) conditions.push(gte(fieldRentals.startsAt, new Date(from)));
  if (to) conditions.push(lte(fieldRentals.startsAt, new Date(to)));
  if (status)
    conditions.push(
      eq(
        fieldRentals.status,
        status as (typeof fieldRentals.status.enumValues)[number],
      ),
    );
  if (scopeCond) conditions.push(scopeCond);

  const rows = await getDb()
    .select({
      id: fieldRentals.id,
      venueId: fieldRentals.venueId,
      venueName: venues.name,
      fieldNumber: fieldRentals.fieldNumber,
      startsAt: fieldRentals.startsAt,
      endsAt: fieldRentals.endsAt,
      status: fieldRentals.status,
      source: fieldRentals.source,
      renterName: fieldRentals.renterName,
      renterPhone: fieldRentals.renterPhone,
      partySize: fieldRentals.partySize,
      paymentMethod: fieldRentals.paymentMethod,
      paymentStatus: fieldRentals.paymentStatus,
      amountDueCents: fieldRentals.amountDueCents,
      amountPaidCents: fieldRentals.amountPaidCents,
      waiverSigned: fieldRentals.waiverSigned,
      checkedInAt: fieldRentals.checkedInAt,
      // Block sessions are ordinary rentals; the list links back up to the
      // parent so staff can see what a row belongs to.
      blockId: fieldRentals.blockId,
      blockLabel: fieldRentalBlocks.label,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .leftJoin(fieldRentalBlocks, eq(fieldRentalBlocks.id, fieldRentals.blockId))
    .where(and(...conditions))
    .orderBy(desc(fieldRentals.startsAt));

  return json({ rentals: rows }, 200);
};

// POST is location-scoped: a venue manager can only create rentals at a venue
// in their assigned locations (super-admin is unscoped). Enforced after the
// org-ownership guard below via callerCanActOnVenue.
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  let body: Record<string, unknown>;
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const validationError = validateAdminRentalCreate(body);
  if (validationError) return json({ error: validationError }, 422);

  const venueId = body.venueId as string;
  const ownership = await requireSameOrgVenue(orgId, venueId);
  if (!ownership.ok) return ownershipDeniedResponse();
  if (!(await callerCanActOnVenue(context, venueId))) {
    return ownershipDeniedResponse();
  }

  const db = getDb();
  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, venueId))
    .limit(1);
  if (!venue) return ownershipDeniedResponse();

  const fieldNumber = body.fieldNumber as number;
  const startsAt = new Date(body.startsAt as string);
  const endsAt = new Date(body.endsAt as string);
  const partySize = (body.partySize as number) ?? 1;
  const purpose = (body.purpose as string) ?? null;
  const notes = (body.notes as string) ?? null;
  const renterName = (body.renterName as string).trim();
  const renterEmail = (body.renterEmail as string) ?? null;
  const renterPhone = (body.renterPhone as string) ?? null;
  const renterUserId = (body.renterUserId as string) ?? null;
  const paymentMethod = body.paymentMethod as
    | "card_online"
    | "card_present"
    | "cash"
    | "comp";

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
  const hourlyRate = resolveRentalHourlyRateCents(
    venue.rentalHourlyRateCents,
    rateCard.defaultHourlyRateCents,
  );
  const amountDueCents =
    paymentMethod === "comp"
      ? 0
      : computeRentalPriceCents(startsAt, endsAt, hourlyRate);

  if (paymentMethod === "cash" || paymentMethod === "comp") {
    // brand omitted → defaults to "aspire". Admin-created rentals don't carry a host-derived brand;
    // branding SoccerOne-venue rentals created via admin is a follow-up.
    const result = await createConfirmedRentalNonStripe({
      organizationId: orgId,
      venueId,
      fieldNumber,
      startsAt,
      endsAt,
      source: "admin_created",
      paymentMethod,
      amountDueCents,
      renterUserId,
      renterName,
      renterEmail,
      renterPhone,
      partySize,
      purpose,
      notes,
      createdByUserId: auth.user.id,
      waiverSigned: false,
      waiverSignedBy: null,
    });
    if (!result.ok) return json({ error: result.error }, 409);
    return json({ rental: result.rental, paymentRequired: false }, 200);
  }

  if (paymentMethod === "card_present") {
    if (!stripe) return json({ error: "Stripe not configured" }, 500);
    // brand omitted → defaults to "aspire". Admin-created rentals don't carry a host-derived brand;
    // branding SoccerOne-venue rentals created via admin is a follow-up.
    const hold = await createRentalHold({
      organizationId: orgId,
      venueId,
      fieldNumber,
      startsAt,
      endsAt,
      source: "admin_created",
      paymentMethod: "card_present",
      amountDueCents,
      renterUserId,
      renterName,
      renterEmail,
      renterPhone,
      partySize,
      purpose,
      notes,
      createdByUserId: auth.user.id,
      waiverSigned: false,
      waiverSignedBy: null,
    });
    if (!hold.ok) return json({ error: hold.error }, 409);

    const partnerStripeAccountId = venue.partnerStripeAccountId ?? null;
    const applicationFeePct = venue.partnerApplicationFeePct ?? 0;
    const applicationFeeCents = partnerStripeAccountId
      ? Math.round((amountDueCents * applicationFeePct) / 100)
      : undefined;
    try {
      const intent = await stripe.paymentIntents.create(
        {
          amount: amountDueCents,
          currency: "usd",
          payment_method_types: ["card_present"],
          capture_method: "automatic",
          metadata: {
            type: "field_rental_walk_up",
            rental_id: hold.rental.id,
            organization_id: orgId,
          },
          ...(partnerStripeAccountId
            ? {
                application_fee_amount: applicationFeeCents,
                transfer_data: { destination: partnerStripeAccountId },
              }
            : {}),
        },
        { idempotencyKey: `${hold.rental.id}:rental-cp-pi:${amountDueCents}` },
      );
      return json(
        {
          paymentRequired: true,
          rentalId: hold.rental.id,
          clientSecret: intent.client_secret,
          amountCents: amountDueCents,
        },
        200,
      );
    } catch (err) {
      // Stripe call failed after the hold row was committed (no outer tx)
      // — manually undo it to release the field.
      await db.delete(fieldRentals).where(eq(fieldRentals.id, hold.rental.id));
      console.error("[rentals] card-present PI create failed", err);
      return json({ error: "Could not start card-present payment" }, 502);
    }
  }

  // card_online → confirmed row, payment link emailing deferred to a
  // follow-up. Row is created unpaid so it shows in the admin list.
  // (Inserted with placeholder paymentMethod "cash" because
  // createConfirmedRentalNonStripe's type union excludes card_online; we
  // immediately update both the method and the payment status after.)
  // brand omitted → defaults to "aspire". Admin-created rentals don't carry a host-derived brand;
  // branding SoccerOne-venue rentals created via admin is a follow-up.
  const result = await createConfirmedRentalNonStripe({
    organizationId: orgId,
    venueId,
    fieldNumber,
    startsAt,
    endsAt,
    source: "admin_created",
    paymentMethod: "cash",
    amountDueCents,
    renterUserId,
    renterName,
    renterEmail,
    renterPhone,
    partySize,
    purpose,
    notes,
    createdByUserId: auth.user.id,
    waiverSigned: false,
    waiverSignedBy: null,
  });
  if (!result.ok) return json({ error: result.error }, 409);
  const [fixed] = await db
    .update(fieldRentals)
    .set({ paymentMethod: "card_online", paymentStatus: "unpaid", amountPaidCents: 0 })
    .where(eq(fieldRentals.id, result.rental.id))
    .returning();
  return json({ rental: fixed, paymentRequired: false }, 200);
};
