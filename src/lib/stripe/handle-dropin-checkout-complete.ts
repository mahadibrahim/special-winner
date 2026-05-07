/**
 * Stripe webhook handler for drop-in booking checkout completion.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "checkout.session.completed"` AND
 * `metadata.type === "dropin_booking"`.
 *
 * Inserts the drop-in booking row in the *paid* state (the free path
 * handles its own row insertion in the orchestrator). Idempotency is
 * keyed on the Checkout Session id — if a row with this
 * `stripe_payment_intent_id` already exists we skip the insert.
 *
 * Team assignment runs at insert time (the row didn't exist before, so
 * existing-team counts haven't shifted since the user clicked "Book").
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

export async function handleDropInCheckoutComplete(
  session: Stripe.Checkout.Session,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; bookingId: string; paidCents: number }
> {
  const sessionDbId = session.metadata?.session_id;
  const userId = session.metadata?.user_id;
  const paymentMethod = session.metadata?.payment_method as
    | DropInPaymentMethod
    | undefined;
  const membershipId = session.metadata?.membership_id || null;

  if (!sessionDbId || !userId) {
    return { status: "skipped", reason: "missing dropin metadata" };
  }
  if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return { status: "skipped", reason: "missing/invalid payment_method" };
  }

  const db = getDb();
  const paymentIntentId = (session.payment_intent as string) ?? null;

  // Idempotency: if we've already created a booking for this PaymentIntent,
  // bail. The stripe_events ledger upstream is the canonical dedupe; this
  // is the belt-and-braces secondary check.
  if (paymentIntentId) {
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
  }

  return await db.transaction(async (tx) => {
    // Lock the parent session row to serialize team-assignment with any
    // concurrent bookings.
    const [sessionRow] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, sessionDbId))
      .for("update");
    if (!sessionRow) {
      return { status: "skipped", reason: `session ${sessionDbId} not found` };
    }

    // Existing-confirmed bookings for team-balance computation.
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
        source: "online_booking",
        paymentMethod,
        amountPaidCents: session.amount_total ?? 0,
        membershipId,
        stripePaymentIntentId: paymentIntentId,
        teamAssignment: team,
      })
      .returning();

    // Fire-and-forget confirmation. The webhook handler is idempotent and
    // we don't want messaging failures to roll back the booking insert.
    queueMicrotask(() => {
      void dispatchBookingConfirmation(booking.id).catch((err) => {
        console.error(
          "[dropin] checkout booking-confirmation dispatch failed",
          err,
        );
      });
    });

    return {
      status: "processed",
      bookingId: booking.id,
      paidCents: session.amount_total ?? 0,
    };
  });
}
