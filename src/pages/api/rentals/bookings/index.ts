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
import { and, desc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  fieldRentals,
  fieldRentalRateCard,
} from "@/lib/db/schema/field-rentals";
import { fieldRentalBlocks } from "@/lib/db/schema/field-rental-blocks";
import { blockPaidCents } from "@/lib/rentals/blocks/lifecycle";
import { computeBlockOwed, mintBlockToken } from "@/lib/rentals/blocks/tokens";
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
import {
  DEFAULT_BOOKING_WINDOW_DAYS,
  bookingWindowEndUtc,
} from "@/lib/memberships/booking-window";
import { brandFromHost } from "@/lib/organization/soccerone-routing";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";

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
      // Sessions that belong to a recurring block are grouped under it on the
      // dashboard: twelve winter Tuesdays are one commitment, not twelve.
      blockId: fieldRentals.blockId,
      venueName: venues.name,
    })
    .from(fieldRentals)
    .leftJoin(venues, eq(venues.id, fieldRentals.venueId))
    .where(eq(fieldRentals.renterUserId, locals.user.id))
    .orderBy(desc(fieldRentals.startsAt));

  const blockIds = [...new Set(rows.map((r) => r.blockId).filter((id): id is string => !!id))];

  // Scoped to the caller both ways: the sessions are already theirs, and the
  // block rows are re-filtered on renterUserId so a session mis-stamped with
  // someone else's block can never leak that block's money or its pay link.
  const blockRows =
    blockIds.length > 0
      ? await db
          .select()
          .from(fieldRentalBlocks)
          .where(
            and(
              inArray(fieldRentalBlocks.id, blockIds),
              eq(fieldRentalBlocks.renterUserId, locals.user.id),
            ),
          )
      : [];

  const blocks = [];
  for (const block of blockRows) {
    const sessions = rows.filter((r) => r.blockId === block.id);
    const live = sessions.filter((s) => s.status !== "cancelled");
    const starts = live.map((s) => s.startsAt.getTime()).sort((a, b) => a - b);
    const owed = computeBlockOwed(block);
    // mintToken hands back the live token when one exists, so this is
    // idempotent - a dashboard refresh does not proliferate links. Only blocks
    // that actually owe money get one.
    const token = owed.kind === "none" ? null : await mintBlockToken(block);

    blocks.push({
      id: block.id,
      label: block.label,
      status: block.status,
      sessionCount: live.length,
      firstSessionAt: starts.length > 0 ? new Date(starts[0]).toISOString() : null,
      lastSessionAt:
        starts.length > 0 ? new Date(starts[starts.length - 1]).toISOString() : null,
      totalCents: block.totalCents,
      paidCents: blockPaidCents(block),
      depositDueCents: block.depositDueCents,
      balanceDueCents: block.balanceDueCents,
      balanceDueAt: block.balanceDueAt?.toISOString() ?? null,
      owed: {
        kind: owed.kind,
        cents: owed.cents,
        dueAt: owed.dueAt?.toISOString() ?? null,
      },
      payUrl: token ? `/rentals/blocks/${token}` : null,
    });
  }

  const blockLabels = new Map(blocks.map((b) => [b.id, b.label]));

  return json(
    {
      rentals: rows.map((r) => ({
        ...r,
        blockLabel: r.blockId ? (blockLabels.get(r.blockId) ?? null) : null,
      })),
      blocks,
    },
    200,
  );
};

export const POST: APIRoute = async ({ request, locals, clientAddress }) => {
  // Rate-limit guest submissions (public unauthenticated write path).
  if (!locals.user) {
    const ip = clientAddress || "unknown";
    const rl = rateLimit(`rental-request:ip:${ip}`, 8, 60_000);
    if (!rl.allowed) return rateLimitedResponse(rl.retryAfter ?? 60);
  }

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

  // Guest path: no session. Require contact fields; store renterUserId = null.
  let renterUserId: string | null = null;
  let renterName: string;
  let renterEmail: string | null;
  let renterPhone: string | null = null;
  if (locals.user) {
    renterUserId = locals.user.id;
    renterName = waiverName; // signed-in: waiver name is the renter
    renterEmail = locals.user.email;
  } else {
    const gName = (body.renterName as string | undefined)?.trim() || waiverName;
    const gEmail = (body.renterEmail as string | undefined)?.trim() ?? "";
    if (!gName) return json({ error: "Your name is required" }, 422);
    if (!gEmail || gEmail.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(gEmail)) {
      return json({ error: "A valid email is required" }, 422);
    }
    renterName = gName;
    renterEmail = gEmail;
    renterPhone = (body.renterPhone as string | undefined)?.trim() || null;
  }

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
  // ahead. Beyond the window is a contact-the-venue conversation — venue
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
    const windowDays = DEFAULT_BOOKING_WINDOW_DAYS;
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

  // Rentals are flat-priced — no member discount (removed 2026-07). Members
  // get no rental discount; the membership system is unaffected elsewhere.
  const amountDueCents = baseAmountDueCents;

  const bookingBrand = brandFromHost(request.headers.get("host") ?? "");

  const req = await createRentalRequest({
    organizationId: orgId,
    venueId,
    fieldNumber,
    startsAt,
    endsAt,
    amountDueCents,
    requestHoldHours: rateCard.requestHoldHours,
    renterUserId,
    renterName,
    renterEmail,
    renterPhone,
    partySize,
    purpose,
    notes: null,
    createdByUserId: renterUserId,
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
