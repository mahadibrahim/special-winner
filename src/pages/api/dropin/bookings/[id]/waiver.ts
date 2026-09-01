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
 *
 * Annual waiver: a booking whose PARTICIPANT already has a valid liability
 * consent for the org is settled without asking — the endpoint stamps the
 * on-file attribution and reports `alreadySigned`. A signature that IS fresh
 * is recorded into the canonical `consents` log as well as onto the booking.
 */
import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { familyMembers } from "@/lib/db/schema/registrations";
import {
  WAIVER_ON_FILE_ATTRIBUTION,
  hasValidLiabilityWaiver,
  recordLiabilityWaiver,
} from "@/lib/consents/liability";
import {
  waiverConsentVariant,
  waiverAssentSentence,
} from "@/lib/consents/waiver-consent-language";
import { DROPIN_WAIVER_ACCEPT_LABEL } from "@/lib/dropin/waiver-text";
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

export const POST: APIRoute = async ({
  params,
  request,
  locals,
  clientAddress,
}) => {
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
      // The PARTICIPANT, present only on child bookings (the paid/free class
      // make-up doors). Null for every adult drop-in — an adult booking has
      // no `family_members` row, so it has no person-scoped annual waiver.
      familyMemberId: dropInBookings.familyMemberId,
      // Non-null exactly when the participant is a dependent (the DB CHECK
      // makes parent/self an XOR), which is the guardian-variant signal.
      participantParentUserId: familyMembers.parentUserId,
      // Only needed to render the guardian assent sentence's player name —
      // null whenever familyMemberId is null (leftJoin finds no row).
      participantFirstName: familyMembers.firstName,
      participantLastName: familyMembers.lastName,
    })
    .from(dropInBookings)
    .innerJoin(dropInSessions, eq(dropInSessions.id, dropInBookings.sessionId))
    .leftJoin(
      familyMembers,
      eq(familyMembers.id, dropInBookings.familyMemberId),
    )
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

  const now = new Date();

  // ANNUAL WAIVER, read side. The `waiverSigned` flag above is per-BOOKING,
  // so it is false on every new booking even for a family who signed a
  // fortnight ago at another door. The platform rule is per person, per org,
  // for a year — so before treating this as an ask, check whether the
  // participant is already covered.
  if (row.familyMemberId) {
    let covered = false;
    try {
      covered = await hasValidLiabilityWaiver(
        row.familyMemberId,
        row.organizationId,
        db,
      );
    } catch (err) {
      // Fail towards RECORDING the signature the user just typed — that is
      // the safe direction here (worst case, one redundant consents row).
      console.error("[dropin-waiver] waiver validity lookup failed", err);
    }
    if (covered) {
      await db
        .update(dropInBookings)
        .set({
          waiverSigned: true,
          waiverSignedBy: WAIVER_ON_FILE_ATTRIBUTION,
          // Written as an EXPLICIT null rather than merely omitted — this
          // update can land on a row that already carries a date, and the
          // invariant should enforce itself here instead of relying on the
          // column happening to be empty. Load-bearing: this row is a
          // derived copy of an earlier signature, not a signature, and
          // hasValidLiabilityWaiver's legacy fallback accepts any DATED
          // drop_in_bookings row — dating it would let each booking renew
          // the very window it was derived from. Same rule as the paid
          // door's fulfillment stamp and book-child.ts's on-file branch.
          waiverSignedAt: null,
          updatedAt: now,
        })
        .where(eq(dropInBookings.id, id));
      // Nothing is appended to `consents`: this branch is a READ.
      return json({ ok: true, alreadySigned: true }, 200);
    }
  }

  // A genuinely fresh signature. The guardian variant follows from the
  // participant being a dependent — the same `isMinor` signal resolveSigner
  // hands the self-serve WaiverCard, derived here from the person row
  // directly (this endpoint has no token to resolve).
  const consentVariant = waiverConsentVariant(
    row.participantParentUserId !== null,
  );
  // What SessionDetail's WaiverCard ACTUALLY shows beside the checkbox: the
  // generic accept line for an adult drop-in, or the guardian assent
  // sentence (naming the child) for a booking with a `family_member_id` —
  // this endpoint's own doc notes familyMemberId is only ever set on child
  // bookings. Record what was on screen, nothing else (#398's rule).
  const participantName =
    row.participantFirstName && row.participantLastName
      ? `${row.participantFirstName} ${row.participantLastName}`.trim()
      : undefined;
  const consentText = row.familyMemberId
    ? waiverAssentSentence(consentVariant, participantName)
    : DROPIN_WAIVER_ACCEPT_LABEL;

  await db
    .update(dropInBookings)
    .set({
      waiverSigned: true,
      waiverSignedAt: now,
      waiverSignedBy: waiverName,
      waiverConsentVariant: consentVariant,
      waiverConsentText: consentText,
      updatedAt: now,
    })
    .where(eq(dropInBookings.id, id));

  // ANNUAL WAIVER, write side. Only child bookings carry a `family_members`
  // participant; an adult drop-in has no person row for a person-scoped
  // consent to hang on, so its `waiverSigned*` columns stay the whole audit
  // record (unchanged behaviour). Best-effort — the signature is already
  // persisted above, and a consents failure must not fail the response.
  if (row.familyMemberId) {
    try {
      await recordLiabilityWaiver(
        {
          familyMemberId: row.familyMemberId,
          organizationId: row.organizationId,
          // The booking's owner is the account of record. Guest signers hold
          // only the PaymentIntent capability, so `locals.user` may be
          // absent — the booking's userId is who the row belongs to either
          // way, and `signedByName` keeps who actually typed the signature.
          signedByUserId: row.userId,
          signedByName: waiverName,
          consentVariant,
          consentText,
          // From THIS request's context, never the body.
          ipAddress: clientAddress ?? null,
          userAgent: request.headers.get("user-agent"),
        },
        db,
      );
    } catch (err) {
      console.error("[dropin-waiver] consent record failed", err);
    }
  }

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
