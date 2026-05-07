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

  return await db.transaction(async (tx) => {
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
      })
      .returning();

    // Fire-and-forget confirmation (walk-up source). Messaging failures
    // must not roll back the booking; dispatch logs its own errors.
    queueMicrotask(() => {
      void dispatchBookingConfirmation(booking.id).catch((err) => {
        console.error(
          "[dropin] walk-up booking-confirmation dispatch failed",
          err,
        );
      });
    });

    return {
      status: "processed",
      bookingId: booking.id,
      paidCents: intent.amount_received ?? intent.amount ?? 0,
    };
  });
}
