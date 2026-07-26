/**
 * POST /api/dropin/bookings/:id/waiver
 *
 * Post-payment waiver signing — "sign before you PLAY, not before you pay".
 * The online booking flows no longer collect a waiver pre-payment; this
 * endpoint captures the typed signature afterwards, from:
 *   - the session page's booking-confirmed card,
 *   - the dashboard bookings "Sign waiver" CTA,
 *   - the confirmation email's sign-the-waiver link.
 *
 * Auth — two paths, either suffices:
 *   1. Signed-in booking owner (`locals.user.id === booking.userId`).
 *   2. Guest capability token: the booking's `stripe_payment_intent_id`,
 *      passed as `paymentIntentId`. Only the buyer holds it (returned by the
 *      inline payment flow / appended to the success URL) — the same trust
 *      model the session-detail endpoint uses to resolve guest bookings.
 *
 * Idempotent: signing an already-signed booking is a 200 no-op (the first
 * signature is never overwritten). This is a SOFT-block flow — nothing here
 * (or anywhere) refuses a booking or check-in over an unsigned waiver;
 * hosts can capture a signature on the spot via the roster surfaces.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { getPostHogServer } from "@/lib/posthog-server";

export const prerender = false;

const bodySchema = z.object({
  waiverName: z.string().trim().min(1).max(200),
  /** Guest capability token — the booking's PaymentIntent id. */
  paymentIntentId: z.string().min(1).max(255).optional(),
});

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async ({ params, request, locals }) => {
  const id = params.id;
  if (!id) return json({ error: "Booking id required" }, 400);

  let parsed;
  try {
    parsed = bodySchema.safeParse(await request.json());
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!parsed.success) {
    return json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      400,
    );
  }
  const { waiverName, paymentIntentId } = parsed.data;

  const db = getDb();
  const [row] = await db
    .select({
      id: dropInBookings.id,
      userId: dropInBookings.userId,
      sessionId: dropInBookings.sessionId,
      status: dropInBookings.status,
      stripePaymentIntentId: dropInBookings.stripePaymentIntentId,
      waiverSigned: dropInBookings.waiverSigned,
      brand: dropInBookings.brand,
      organizationId: dropInSessions.organizationId,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .where(eq(dropInBookings.id, id))
    .limit(1);
  if (!row) return json({ error: "Booking not found" }, 404);

  // Multi-tenant guard — same host-scoping as the other dropin endpoints.
  if (locals.organization && row.organizationId !== locals.organization.id) {
    return json({ error: "Forbidden" }, 403);
  }

  const isOwner = locals.user?.id === row.userId;
  const holdsCapability =
    Boolean(paymentIntentId) &&
    Boolean(row.stripePaymentIntentId) &&
    paymentIntentId === row.stripePaymentIntentId;
  if (!isOwner && !holdsCapability) {
    // 404, not 403 — don't confirm the booking id exists to a caller who
    // can't prove a relationship to it.
    return json({ error: "Booking not found" }, 404);
  }

  // Idempotent no-op: the first signature stands.
  if (row.waiverSigned) {
    return json({ ok: true, alreadySigned: true }, 200);
  }

  await db
    .update(dropInBookings)
    .set({
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: waiverName,
      updatedAt: new Date(),
    })
    .where(eq(dropInBookings.id, id));

  // Funnel signal: post-pay waiver completion rate. Fail-soft — telemetry
  // must never break the signing response (same posture as payment-telemetry).
  try {
    getPostHogServer().capture({
      distinctId: row.userId,
      event: "dropin_waiver_signed",
      properties: {
        booking_id: row.id,
        session_id: row.sessionId,
        booking_status: row.status,
        brand: row.brand,
        organization_id: row.organizationId,
        signed_via: isOwner ? "owner_session" : "payment_intent_capability",
      },
    });
  } catch (err) {
    console.error("[dropin-waiver] telemetry capture failed", err);
  }

  return json({ ok: true, alreadySigned: false }, 200);
};
