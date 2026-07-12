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
 *
 * CAPACITY GATE (the last-spot race): between "click Book" and Stripe
 * confirming payment, another booking (free-path, another Checkout, a
 * kiosk hold, or a promoted waitlister) can take the last seat. Before
 * inserting a confirmed row, this handler re-checks capacity under the
 * same session-row lock via `checkSessionCapacityLocked` (the shared gate
 * — see src/lib/dropin/booking.ts). If the session is full by the time
 * the payment settles:
 *   - the booking is inserted as `waitlisted` with `waitlistPriority: 100`
 *     (front-of-line — this customer already committed and paid, unlike a
 *     voluntary waitlist join at priority 0), and
 *   - the PaymentIntent is auto-refunded in full (never inside the DB tx —
 *     see `refundOverflowPayment` below, which mirrors the 3-layer
 *     idempotency pattern in handle-dropin-walkin-payment.ts's
 *     `refundLatePaymentOnSweptHold`).
 * The customer gets an honest message (`dispatchOverflowRefunded`), not
 * the normal booking confirmation.
 */
import type Stripe from "stripe";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ensureDropInCustomerMembership } from "@/lib/organization/ensure-membership";
import {
  dropInBookings,
  dropInSessions,
  userSkillLevels,
} from "@/lib/db/schema/drop-in";
import { assignTeam } from "@/lib/dropin/team-assignment";
import { checkSessionCapacityLocked } from "@/lib/dropin/booking";
import type { DropInPaymentMethod } from "@/lib/dropin/pricing";
import {
  dispatchBookingConfirmation,
  dispatchOverflowRefunded,
} from "@/lib/dropin/messages/dispatch";
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { fireServerPurchaseConversions } from "@/lib/analytics/server-conversions";
import { stripe } from "@/lib/stripe/client";
import { logAlert } from "@/lib/logging/alerts";
import type { BrandId } from "@/lib/branding/themes";

const VALID_PAYMENT_METHODS: DropInPaymentMethod[] = [
  "card_online",
  "card_present",
  "member_unlimited",
  "member_allotment",
];

// Overflow bookings jump straight to the front of the waitlist — they
// already committed and paid, unlike a voluntary join (priority 0).
const OVERFLOW_WAITLIST_PRIORITY = 100;

type HandlerResult =
  | { status: "skipped"; reason: string }
  | { status: "processed"; bookingId: string; paidCents: number }
  | { status: "overflow"; bookingId: string };

export async function handleDropInCheckoutComplete(
  session: Stripe.Checkout.Session,
): Promise<HandlerResult> {
  const sessionDbId = session.metadata?.session_id;
  const userId = session.metadata?.user_id;
  const paymentMethod = session.metadata?.payment_method as
    | DropInPaymentMethod
    | undefined;
  const membershipId = session.metadata?.membership_id || null;
  const waiverName = session.metadata?.waiver_name || null;
  const waiverSignedAtRaw = session.metadata?.waiver_signed_at;
  const waiverSignedAt = waiverSignedAtRaw ? new Date(waiverSignedAtRaw) : null;
  // Brand is set in extraMetadata at checkout creation time (PR #168, bookings/index.ts).
  const brand = normalizeBrand(session.metadata?.brand);

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
  //
  // EXCEPTION: an overflow row (`waitlisted`, no `stripeRefundId` yet)
  // means a prior delivery inserted the row but the refund call either
  // hadn't run yet or threw — redelivery must retry the refund rather than
  // silently skip forever (the row's existence alone would otherwise mask
  // a stuck un-refunded charge from every future webhook retry).
  if (paymentIntentId) {
    const [existing] = await db
      .select({
        id: dropInBookings.id,
        status: dropInBookings.status,
        stripeRefundId: dropInBookings.stripeRefundId,
      })
      .from(dropInBookings)
      .where(eq(dropInBookings.stripePaymentIntentId, paymentIntentId))
      .limit(1);
    if (existing) {
      if (existing.status === "waitlisted" && !existing.stripeRefundId) {
        await refundOverflowPayment(paymentIntentId, existing.id, brand);
        return {
          status: "skipped",
          reason: `duplicate webhook for payment_intent ${paymentIntentId} — retried overflow refund`,
        };
      }
      return {
        status: "skipped",
        reason: `duplicate webhook for payment_intent ${paymentIntentId}`,
      };
    }
  }

  // Captured inside the tx, used after commit to build GA4/Meta item context.
  let itemLabel = "";
  let itemCategory = "";

  const result: HandlerResult = await db.transaction(async (tx) => {
    // Lock the parent session row to serialize team-assignment AND the
    // capacity gate below with any concurrent bookings (free-path, another
    // Checkout completion, a kiosk hold, or a promotion). Lock ordering:
    // every transaction that touches BOTH the session row and a booking row
    // locks the session FIRST, booking row(s) after — see
    // createConfirmedBookingFreePath (booking.ts), walkin/start.ts, and
    // handle-dropin-walkup-payment.ts, which all follow this order; never
    // the reverse, to avoid deadlocks. handle-dropin-walkin-payment.ts locks
    // only a booking row (by id) and never touches the session row in the
    // same transaction, so it never acquires a second lock and can't
    // participate in a lock-ordering cycle against this one.
    const [sessionRow] = await tx
      .select()
      .from(dropInSessions)
      .where(eq(dropInSessions.id, sessionDbId))
      .for("update");
    if (!sessionRow) {
      return { status: "skipped", reason: `session ${sessionDbId} not found` };
    }

    itemCategory = sessionRow.sportOrClassLabel;
    itemLabel = sessionRow.formatLabel
      ? `${sessionRow.sportOrClassLabel} ${sessionRow.formatLabel}`
      : sessionRow.sportOrClassLabel;

    // Duplicate-user guard, under the same session lock. Two reasons:
    //   1. If this user already holds an ACTIVE row on the session, a second
    //      insert would trip the partial unique index
    //      (drop_in_bookings_one_active_per_user_session) and poison the
    //      webhook with a permanent retry loop.
    //   2. It's the backstop for redelivered events whose PaymentIntent is
    //      no longer findable on the row: after an overflow booking is
    //      promoted and claim-PAID (handle-dropin-claim-payment.ts), the
    //      row's stripePaymentIntentId is replaced by the claim payment's
    //      PI — a redelivery of the ORIGINAL checkout event then misses the
    //      PI-based dedupe above and would re-insert here without this guard.
    const [activeForUser] = await tx
      .select({ id: dropInBookings.id, status: dropInBookings.status })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionDbId),
          eq(dropInBookings.userId, userId),
          sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
        ),
      )
      .limit(1);
    if (activeForUser) {
      return {
        status: "skipped",
        reason: `user ${userId} already has an active booking (${activeForUser.status}) on session ${sessionDbId}`,
      };
    }

    // Re-check capacity under the lock — the last-spot race. The customer
    // paid while the session filled up elsewhere; the shared gate treats
    // confirmed + pending_payment + pending_claim as occupying a seat.
    const capCheck = await checkSessionCapacityLocked(tx, sessionDbId);
    if (capCheck.full) {
      const [overflowBooking] = await tx
        .insert(dropInBookings)
        .values({
          sessionId: sessionDbId,
          userId,
          status: "waitlisted",
          waitlistPriority: OVERFLOW_WAITLIST_PRIORITY,
          source: "online_booking",
          paymentMethod,
          // The amount actually charged — same convention as a cancelled+
          // refunded confirmed booking (processCancelRefund): amountPaidCents
          // records what was charged, stripeRefundId (set after the tx
          // commits, see refundOverflowPayment) records that it was given
          // back. Keeping the real amount here lets the overflow message
          // quote a real refund figure instead of "$0".
          amountPaidCents: session.amount_total ?? 0,
          membershipId,
          stripePaymentIntentId: paymentIntentId,
          teamAssignment: null,
          waiverSigned: waiverName !== null,
          waiverSignedAt,
          waiverSignedBy: waiverName,
          brand,
        })
        .returning();
      return { status: "overflow", bookingId: overflowBooking.id };
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
        waiverSigned: waiverName !== null,
        waiverSignedAt,
        waiverSignedBy: waiverName,
        brand,
      })
      .returning();

    // Confirmation email is dispatched AFTER the tx commits (see below), not
    // here — an un-awaited send inside the tx is dropped when the serverless
    // function freezes after responding.

    // Revenue event — no DB access, so safe inside the tx.
    // Brand-attributed for two-brand segmentation.
    capturePaymentCompleted({
      distinctId: userId,
      kind: "dropin",
      amountCents: session.amount_total ?? 0,
      brand,
      metadata: {
        booking_id: booking.id,
        session_id: sessionDbId,
        payment_method: paymentMethod,
        used_membership: membershipId !== null,
      },
    });

    return {
      status: "processed",
      bookingId: booking.id,
      paidCents: session.amount_total ?? 0,
    };
  });

  if (result.status === "overflow") {
    // Booking makes this user a customer of the org — they're genuinely
    // waitlisted (front of line), not walking away. After the tx so it can
    // never roll back the waitlist row.
    await ensureDropInCustomerMembership(db, userId, sessionDbId);

    if (paymentIntentId) {
      await refundOverflowPayment(paymentIntentId, result.bookingId, brand);
    } else {
      // No PaymentIntent to refund — shouldn't happen for a completed paid
      // Checkout Session, but guard rather than silently drop the alert.
      await logAlert("dropin_overflow_refund_failed", {
        bookingId: result.bookingId,
        error: "checkout session had no payment_intent to refund",
      });
    }
    return result;
  }

  // Server-side ad conversions (GA4 MP + Meta CAPI) — online drop-in is an
  // ad-attributable path. Fired after the tx (the GA4 item context is built
  // from the captured session labels; no DB query needed here). Deduped
  // against the browser pixel by the PaymentIntent id.
  if (result.status === "processed") {
    // Booking makes this user a customer of the org (directory visibility +
    // role-assignment gate). After the tx so it can never roll back a booking.
    await ensureDropInCustomerMembership(db, userId, sessionDbId);

    // Confirmation email — awaited so the send completes before the function
    // freezes. Failure is logged, never thrown (must not poison the webhook).
    await awaitDispatch(
      "dropin checkout confirmation",
      () => dispatchBookingConfirmation(result.bookingId, brand),
      { bookingId: result.bookingId, brand },
    );

    const md = session.metadata ?? {};
    const hasAttribution = md.ga_client_id || md.fbclid || md._fbc || md._fbp;
    if (hasAttribution) {
      const amount = session.amount_total ?? 0;
      fireServerPurchaseConversions({
        metadata: md,
        eventId: (session.payment_intent as string) ?? session.id,
        valueCents: amount,
        brand,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        ga4Items: [
          { id: sessionDbId, name: itemLabel, category: itemCategory, priceCents: amount },
        ],
        ga4PaymentType: "full",
        contentIds: [sessionDbId],
        contentName: itemLabel,
        contentCategory: "dropin",
      });
    }
  }

  return result;
}

/**
 * Refund the overflow customer's PaymentIntent in full and record it.
 * Mirrors `refundLatePaymentOnSweptHold` in handle-dropin-walkin-payment.ts
 * — same 3-layer idempotency:
 *
 *   1. `refunds.create` carries the idempotency key
 *      `${paymentIntentId}:overflow-refund`, distinct from every other
 *      refund key in the codebase (sweep-refund, dropin:<id>:refund) —
 *      Stripe-side dedupe for concurrent/duplicate calls within its window.
 *   2. `stripeRefundId` on the booking row is the durable "already
 *      refunded" marker — a webhook redelivered after Stripe's idempotency
 *      window still can't refund twice, because the caller (see the
 *      early-return branch above) only re-enters this function when
 *      `stripeRefundId` is still null.
 *   3. On failure, the booking row and the loud `dropin_overflow_refund_failed`
 *      alert both leave `stripeRefundId` null — the next webhook
 *      redelivery (or a manual staff retry) can still complete it. No
 *      customer message is sent on failure — telling someone "you've been
 *      refunded" before the refund actually completed would be dishonest.
 */
async function refundOverflowPayment(
  paymentIntentId: string,
  bookingId: string,
  brand: BrandId,
): Promise<void> {
  const db = getDb();

  if (!stripe) {
    await logAlert("dropin_overflow_refund_failed", {
      bookingId,
      stripePaymentIntentId: paymentIntentId,
      error: "stripe-not-configured",
    });
    return;
  }

  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `${paymentIntentId}:overflow-refund` },
    );
    await db
      .update(dropInBookings)
      .set({ stripeRefundId: refund.id, updatedAt: new Date() })
      .where(eq(dropInBookings.id, bookingId));

    // LOUD by design: money moved without a human in the loop, and the
    // customer is now front-of-waitlist instead of confirmed.
    await logAlert("dropin_overflow_refunded", {
      message:
        "checkout overflow — session filled during payment, auto-refunded and waitlisted front-of-line",
      bookingId,
      stripePaymentIntentId: paymentIntentId,
      stripeRefundId: refund.id,
    });

    await awaitDispatch(
      "dropin overflow refunded",
      () => dispatchOverflowRefunded(bookingId),
      { bookingId, brand },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logAlert("dropin_overflow_refund_failed", {
      bookingId,
      stripePaymentIntentId: paymentIntentId,
      error: message,
    });
  }
}
