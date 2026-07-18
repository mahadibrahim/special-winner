/**
 * GET  /api/rentals/bookings → the authenticated user's field rentals.
 * POST /api/rentals/bookings → create a rental REQUEST.
 *   Requests are held for `requestHoldHours` pending admin approval; no
 *   Stripe interaction happens here — payment is collected via the pay
 *   endpoint after approval.
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
import {
  resolveRentalHourlyRateCents,
  computeRentalPriceCents,
} from "@/lib/rentals/pricing";
import { quoteRentalCents } from "@/lib/rentals/soccerone-pricing";
import { validateRentalBookingRequest } from "@/lib/rentals/validators";
import { createRentalRequest } from "@/lib/rentals/booking";
import {
  dispatchRentalRequestReceived,
  dispatchNewRentalRequestToAdmin,
} from "@/lib/rentals/messages/dispatch";
import { getActiveMembershipForOrg } from "@/lib/memberships/get-active-membership";
import { applyMemberRentalDiscount } from "@/lib/memberships/discount";
import {
  resolveBookingWindowDays,
  bookingWindowEndUtc,
} from "@/lib/memberships/booking-window";
import { brandFromHost } from "@/lib/organization/soccerone-routing";

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
      // Surfaced so the dashboard can render a hold-expiry countdown for
      // rentals still in `pending_payment`.
      paymentExpiresAt: fieldRentals.paymentExpiresAt,
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

  // Membership is looked up once and feeds BOTH the advance-booking window
  // and the rental discount below. A lookup failure falls back to no
  // membership: base price, default window.
  let membership: Awaited<ReturnType<typeof getActiveMembershipForOrg>> = null;
  try {
    membership = await getActiveMembershipForOrg(locals.user.id, orgId);
  } catch (err) {
    console.error("[rentals] membership lookup failed (continuing without membership)", err);
  }

  const orgTimeZone = locals.organization?.timezone ?? "America/New_York";

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

  // Advance-booking window: online booking opens DEFAULT_BOOKING_WINDOW_DAYS
  // ahead; membership benefits (booking_window_days) can extend it (Founder
  // = 14). Beyond the window is a contact-the-venue conversation — venue
  // staff create those through the admin path, which is not window-limited.
  //
  // Skipped under E2E_TEST_ENDPOINTS (CI/test dev servers only — same flag
  // that gates /api/test/*): the rentals API tests book far-future slots on
  // purpose so concurrent runs never contend for the same slot space on the
  // shared CI database. The window math itself is unit-tested.
  if (process.env.E2E_TEST_ENDPOINTS !== "yes") {
    if (endsAt.getTime() <= Date.now()) {
      return json({ error: "That time has already passed" }, 422);
    }
    const windowDays = resolveBookingWindowDays(membership?.tier.benefits ?? null);
    if (startsAt >= bookingWindowEndUtc(new Date(), windowDays, orgTimeZone)) {
      return json(
        {
          error: `Online booking opens ${windowDays} days ahead. To reserve a date further out, contact the venue.`,
        },
        422,
      );
    }

    const minLeadHours = rateCard.minLeadTimeHours;
    if (startsAt.getTime() < Date.now() + minLeadHours * 60 * 60_000) {
      return json(
        {
          error: `Requests must be at least ${minLeadHours} hours in advance. To book sooner, contact the venue directly.`,
        },
        422,
      );
    }
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

  // Price in the org timezone — slots are constructed in org tz (see zonedHourToUtc).
  const baseAmountDueCents =
    locals.brandId === "soccerone"
      ? quoteRentalCents(startsAt, endsAt, orgTimeZone)
      : computeRentalPriceCents(
          startsAt,
          endsAt,
          resolveRentalHourlyRateCents(
            venue.rentalHourlyRateCents,
            rateCard.defaultHourlyRateCents,
          ),
        );

  // Member rental discount — reuses the membership fetched above for the
  // booking-window check. For Aspire (no tiers seeded), the lookup returned
  // null and amountDueCents is byte-identical to baseAmountDueCents.
  // The discount is baked into amountDueCents, which is stored on the row
  // and read back by the pay endpoint — Stripe metadata now lives there.
  let amountDueCents = baseAmountDueCents;
  if (membership) {
    amountDueCents = applyMemberRentalDiscount(
      baseAmountDueCents,
      membership.tier.benefits,
    );
  }

  const bookingBrand = brandFromHost(request.headers.get("host") ?? "");

  const req = await createRentalRequest({
    organizationId: orgId,
    venueId,
    fieldNumber,
    startsAt,
    endsAt,
    amountDueCents,
    requestHoldHours: rateCard.requestHoldHours,
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
    brand: bookingBrand,
  });
  if (!req.ok) return json({ error: req.error }, 409);

  // Fire-and-forget notifications — never fail the request over a send error.
  await dispatchRentalRequestReceived(req.rental.id).catch((e) =>
    console.error("[rentals] request-received dispatch failed", e),
  );
  await dispatchNewRentalRequestToAdmin(req.rental.id).catch((e) =>
    console.error("[rentals] admin new-request dispatch failed", e),
  );

  return json({ requested: true, rentalId: req.rental.id }, 200);
};
