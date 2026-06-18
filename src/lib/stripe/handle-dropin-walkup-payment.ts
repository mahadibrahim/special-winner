/**
 * Stripe webhook handler for drop-in walk-up card-present payments.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "payment_intent.succeeded"` AND
 * `metadata.type === "dropin_booking_walk_up"`.
 *
 * The walk-up endpoint creates the PaymentIntent first; the booking row
 * gets inserted *after* the reader confirms via this webhook. This mirrors
 * `handle-dropin-checkout-complete.ts` for the online card flow — the
 * difference is only the event source (PaymentIntent vs CheckoutSession).
 *
 * Idempotency is keyed on the PaymentIntent id (a row with this
 * stripe_payment_intent_id already exists → skip).
 */
import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  dropInBookings,
  dropInSessions,
  userSkillLevels,
} from "@/lib/db/schema/drop-in";
import { assignTeam } from "@/lib/dropin/team-assignment";
import type { DropInPaymentMethod } from "@/lib/dropin/pricing";
import { dispatchBookingConfirmation } from "@/lib/dropin/messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";

const VALID_PAYMENT_METHODS: DropInPaymentMethod[] = [
  "card_online",
  "card_present",
  "member_unlimited",
  "member_allotment",
];

export async function handleDropInWalkUpPayment(
  intent: Stripe.PaymentIntent,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; bookingId: string; paidCents: number }
> {
  const sessionDbId = intent.metadata?.session_id;
  const userId = intent.metadata?.user_id;
  const paymentMethod = intent.metadata?.payment_method as
    | DropInPaymentMethod
    | undefined;
  const membershipId = intent.metadata?.membership_id || null;

  if (!sessionDbId || !userId) {
    return { status: "skipped", reason: "missing dropin walk-up metadata" };
  }
  if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return { status: "skipped", reason: "missing/invalid payment_method" };
  }

  const db = getDb();
  const paymentIntentId = intent.id;

  // Belt-and-braces dedupe (the stripe_events ledger upstream is canonical).
  const [existing] = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(eq(dropInBookings.stripePaymentIntentId, paymentIntentId))
    .limit(1);
  if (existing) {
    return {
      status: "skipped",
      reason: `duplicate webhook for payment_intent ${paymentIntentId}`,
    };
  }

  const result:
    | { status: "skipped"; reason: string }
    | { status: "processed"; bookingId: string; paidCents: number } =
    await db.transaction(async (tx) => {
    // Lock the parent session row — serializes team-assignment with any
    // concurrent walk-up or online bookings.
    const [sessionRow] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, sessionDbId))
      .for("update");
    if (!sessionRow) {
      return { status: "skipped", reason: `session ${sessionDbId} not found` };
    }

    const existingForTeam = await tx
      .select({
        teamAssignment: dropInBookings.teamAssignment,
        skillLevel: sql<string>`coalesce(usl.level::text, 'all_levels')`,
      })
      .from(dropInBookings)
      .leftJoin(
        sql`user_skill_levels usl`,
        sql`usl.user_id = ${dropInBookings.userId} AND usl.sport = ${sessionRow.sportOrClassLabel}`,
      )
      .where(
        and(
          eq(dropInBookings.sessionId, sessionDbId),
          eq(dropInBookings.status, "confirmed"),
        ),
      );

    const [skillRow] = await tx
      .select({ level: userSkillLevels.level })
      .from(userSkillLevels)
      .where(
        and(
          eq(userSkillLevels.userId, userId),
          eq(userSkillLevels.sport, sessionRow.sportOrClassLabel),
        ),
      )
      .limit(1);
    const userSkill = skillRow?.level ?? "all_levels";

    const team = assignTeam(sessionRow, userSkill, existingForTeam);

    const [booking] = await tx
      .insert(dropInBookings)
      .values({
        sessionId: sessionDbId,
        userId,
        status: "confirmed",
        source: "walk_up",
        paymentMethod,
        amountPaidCents: intent.amount_received ?? intent.amount ?? 0,
        membershipId,
        stripePaymentIntentId: paymentIntentId,
        teamAssignment: team,
        // At-facility walk-up: no brand host signal available.
        // Column default ("aspire") applies.
      })
      .returning();

    // Confirmation is dispatched after the tx commits (see below) — an
    // un-awaited send here is dropped when the serverless function freezes.

    return {
      status: "processed",
      bookingId: booking.id,
      paidCents: intent.amount_received ?? intent.amount ?? 0,
    };
  });

  // Revenue analytics only. Walk-up is an at-facility sale with no ad click
  // behind it, so it is deliberately NOT reported to GA4 Ads / Meta as a
  // conversion — only to PostHog for internal revenue reporting.
  if (result.status === "processed") {
    // Confirmation email — awaited so the send completes before the function
    // freezes; logged-but-not-thrown on failure.
    await awaitDispatch(
      "dropin walk-up confirmation",
      () => dispatchBookingConfirmation(result.bookingId),
      { bookingId: result.bookingId },
    );

    capturePaymentCompleted({
      distinctId: userId,
      kind: "dropin",
      amountCents: result.paidCents,
      brand: normalizeBrand(intent.metadata?.brand),
      metadata: {
        booking_id: result.bookingId,
        session_id: sessionDbId,
        payment_method: paymentMethod,
        source: "walk_up",
        used_membership: membershipId !== null,
      },
    });
  }

  return result;
}
