/**
 * Stripe webhook fulfillment for paid drop-in bookings.
 *
 * Two adapters over ONE shared core (`fulfillDropInBookingPayment`):
 *   - `handleDropInCheckoutComplete` — legacy hosted Checkout, dispatched on
 *     `checkout.session.completed` with `metadata.type === "dropin_booking"`.
 *     Kept intact for any Checkout Sessions in flight at deploy time.
 *   - handle-dropin-booking-payment.ts — the current inline Payment Element
 *     flow, dispatched on `payment_intent.succeeded` with
 *     `metadata.type === "dropin_booking_embedded"`.
 * Both producers stamp the same metadata contract (see
 * src/lib/dropin/create-checkout.ts), so the core is payload-agnostic.
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
import { checkSessionCapacityLocked, sanitizeReferralSource } from "@/lib/dropin/booking";
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
import { recordLiabilityWaiver } from "@/lib/consents/liability";
import { DROPIN_WAIVER_TEXT } from "@/lib/dropin/waiver-text";
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

/**
 * `waiverSignedBy` attribution for a booking covered by the child's ANNUAL
 * liability waiver rather than a signature taken at purchase — the wording
 * the caller contract in src/lib/consents/liability.ts prescribes, so the
 * dashboard/roster surfaces render "who signed" honestly instead of implying
 * this parent signed again for this class. The canonical evidence is the
 * `consents` row; this column is a derived copy.
 */
const WAIVER_ON_FILE_ATTRIBUTION = "On file (annual waiver)";

/** A transaction handle from `db.transaction(...)` — mirrors the `DbClient`
 *  shape in src/lib/consents/liability.ts. */
type Tx = Parameters<Parameters<ReturnType<typeof getDb>["transaction"]>[0]>[0];

type HandlerResult =
  | { status: "skipped"; reason: string }
  | { status: "processed"; bookingId: string; paidCents: number }
  | { status: "overflow"; bookingId: string };

/** Internal transaction outcome — `duplicate_user` needs post-commit money
 *  handling (never a Stripe call inside the tx) before it collapses into a
 *  `skipped` HandlerResult. */
type TxResult = HandlerResult | { status: "duplicate_user"; activeStatus: string };

/**
 * Payload-agnostic view of a settled drop-in booking payment — everything
 * the fulfillment core needs, extracted by the per-event-type adapters.
 */
export interface DropInBookingFulfillmentInput {
  /** The fulfillment metadata contract (see create-checkout.ts). */
  metadata: Record<string, string> | null;
  paymentIntentId: string | null;
  /** Total actually charged, in cents. */
  amountTotalCents: number;
  /** Buyer email — server-side ad-conversion identity. */
  customerEmail: string | null;
  /** Conversion-dedupe event id when no PaymentIntent id is available. */
  fallbackEventId: string;
}

/** Adapter: legacy hosted Checkout (`checkout.session.completed`,
 *  metadata.type "dropin_booking"). */
export async function handleDropInCheckoutComplete(
  session: Stripe.Checkout.Session,
): Promise<HandlerResult> {
  return fulfillDropInBookingPayment({
    metadata: session.metadata ?? null,
    paymentIntentId:
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : (session.payment_intent?.id ?? null),
    amountTotalCents: session.amount_total ?? 0,
    customerEmail:
      session.customer_details?.email ?? session.customer_email ?? null,
    fallbackEventId: session.id,
  });
}

export async function fulfillDropInBookingPayment(
  input: DropInBookingFulfillmentInput,
): Promise<HandlerResult> {
  const md = input.metadata ?? {};
  const sessionDbId = md.session_id;
  const userId = md.user_id;
  const paymentMethod = md.payment_method as DropInPaymentMethod | undefined;
  const membershipId = md.membership_id || null;
  const waiverName = md.waiver_name || null;
  const waiverSignedAtRaw = md.waiver_signed_at;
  const waiverSignedAt = waiverSignedAtRaw ? new Date(waiverSignedAtRaw) : null;
  // Brand is set in extraMetadata at payment creation time (PR #168, bookings/index.ts).
  const brand = normalizeBrand(md.brand);
  // Child paid make-up (see bookings/index.ts's file doc comment): the
  // checkout endpoint already validated this is the buyer's dependent and
  // that the session is `kind: "class"` before stamping it, so the webhook
  // trusts it exactly like `membership_id` above — never re-validated here.
  const familyMemberId = md.family_member_id || null;
  // ANNUAL WAIVER (src/lib/consents/liability.ts), stamped by the booking
  // endpoint — see the metadata block in api/dropin/bookings/index.ts.
  // Trusted here exactly like `family_member_id` and `membership_id` above:
  // the endpoint is the validating boundary, and this handler has no request
  // context to re-derive an answer from.
  //
  //   waiverOnFile   → the child was already covered; write the derived
  //                    "signed" columns and NOTHING to `consents`
  //                    (recordLiabilityWaiver is append-only and must only
  //                    ever see a fresh signature — per its caller contract).
  //   freshSignature → a human signed on the booking request; the canonical
  //                    consents row is written below, inside the same
  //                    transaction as the booking, with the ip/UA the
  //                    endpoint captured.
  //
  // A supplied signature always wins over the on-file flag: the endpoint only
  // sets one or the other, but if both ever arrived, a real signature is
  // evidence and must be recorded.
  const waiverOnFile = waiverName === null && md.waiver_on_file === "1";
  const bookingWaiverSigned = waiverName !== null || waiverOnFile;
  const bookingWaiverSignedBy =
    waiverName ?? (waiverOnFile ? WAIVER_ON_FILE_ATTRIBUTION : null);
  // Only a FRESH signature gets a variant — it names the text the human was
  // shown. The child paid path is always a guardian signing for a minor.
  const bookingWaiverVariant = waiverName !== null && familyMemberId ? "guardian" : null;
  // Re-sanitize even though create-checkout.ts already sanitized before
  // stamping metadata — the webhook is the DB insert boundary, so it never
  // trusts a round-tripped Stripe value without re-checking the allow-list.
  const referralSource = sanitizeReferralSource(md.referral_source);

  if (!sessionDbId || !userId) {
    return { status: "skipped", reason: "missing dropin metadata" };
  }
  if (!paymentMethod || !VALID_PAYMENT_METHODS.includes(paymentMethod)) {
    return { status: "skipped", reason: "missing/invalid payment_method" };
  }

  const db = getDb();
  const paymentIntentId = input.paymentIntentId;

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

  const txResult: TxResult = await db.transaction(async (tx) => {
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
    //      (drop_in_bookings_one_active_per_user_session_v2) and poison the
    //      webhook with a permanent retry loop.
    //   2. It's the backstop for redelivered events whose PaymentIntent is
    //      no longer findable on the row: after an overflow booking is
    //      promoted and claim-PAID (handle-dropin-claim-payment.ts), the
    //      row's stripePaymentIntentId is replaced by the claim payment's
    //      PI — a redelivery of the ORIGINAL checkout event then misses the
    //      PI-based dedupe above and would re-insert here without this guard.
    // Participant-scoped: matches the DB's own dedupe key
    // (drop_in_bookings_one_active_per_participant_session_v3, keyed on
    // COALESCE(family_member_id, user_id)). Without this, a parent whose
    // first child already has an active row on this session would have a
    // SECOND child's paid make-up wrongly treated as a duplicate of the
    // first child's booking. When `familyMemberId` is absent (every adult
    // drop-in, unchanged) this is byte-for-byte the original query.
    const participantFilter = familyMemberId
      ? eq(dropInBookings.familyMemberId, familyMemberId)
      : eq(dropInBookings.userId, userId);
    const [activeForUser] = await tx
      .select({
        id: dropInBookings.id,
        status: dropInBookings.status,
        stripePaymentIntentId: dropInBookings.stripePaymentIntentId,
      })
      .from(dropInBookings)
      .where(
        and(
          eq(dropInBookings.sessionId, sessionDbId),
          participantFilter,
          sql`${dropInBookings.status} IN ('confirmed', 'waitlisted', 'pending_claim', 'pending_payment')`,
        ),
      )
      .limit(1);
    if (activeForUser) {
      // Belt-and-braces: if the active row is owned by THIS PaymentIntent,
      // this is a straight redelivery that slipped past both the ledger and
      // the pre-transaction PI dedupe (fail-open ledger + concurrent
      // deliveries racing the insert). Never hand the active row's own live
      // payment to the duplicate-refund path — quiet skip.
      if (
        paymentIntentId &&
        activeForUser.stripePaymentIntentId === paymentIntentId
      ) {
        return {
          status: "skipped",
          reason: `duplicate webhook for payment_intent ${paymentIntentId} — active booking ${activeForUser.id} already owns it`,
        };
      }
      // Resolved after the tx commits: a LIVE duplicate charge (this PI is
      // unrefunded and owned by no row) is refunded; a redelivery of an
      // already-refunded charge is quietly skipped. See
      // resolveDuplicateUserCharge below.
      return { status: "duplicate_user", activeStatus: activeForUser.status };
    }

    // Re-check capacity under the lock — the last-spot race. The customer
    // paid while the session filled up elsewhere; the shared gate treats
    // confirmed + pending_payment + pending_claim as occupying a seat.
    const capCheck = await checkSessionCapacityLocked(
      tx,
      sessionDbId,
      sessionRow.capacity,
    );
    if (capCheck.full) {
      const [overflowBooking] = await tx
        .insert(dropInBookings)
        .values({
          sessionId: sessionDbId,
          userId,
          familyMemberId,
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
          amountPaidCents: input.amountTotalCents,
          membershipId,
          stripePaymentIntentId: paymentIntentId,
          teamAssignment: null,
          waiverSigned: bookingWaiverSigned,
          waiverSignedAt,
          waiverSignedBy: bookingWaiverSignedBy,
          waiverConsentVariant: bookingWaiverVariant,
          brand,
          referralSource,
        })
        .returning();
      // The signature is real even though the seat wasn't — the customer read
      // the text and agreed to it. Same reasoning book-child.ts applies to its
      // `session_full` return: `consents` records SIGNATURES, not bookings.
      await recordFreshGuardianWaiver(tx, {
        familyMemberId,
        organizationId: sessionRow.organizationId,
        userId,
        waiverName,
        metadata: md,
      });
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
        familyMemberId,
        status: "confirmed",
        source: "online_booking",
        paymentMethod,
        amountPaidCents: input.amountTotalCents,
        membershipId,
        stripePaymentIntentId: paymentIntentId,
        teamAssignment: team,
        waiverSigned: bookingWaiverSigned,
        waiverSignedAt,
        waiverSignedBy: bookingWaiverSignedBy,
        waiverConsentVariant: bookingWaiverVariant,
        brand,
        referralSource,
      })
      .returning();

    // Canonical annual consent for a signature taken at the paid door — in
    // THIS transaction so it lands with the booking it belongs to.
    await recordFreshGuardianWaiver(tx, {
      familyMemberId,
      organizationId: sessionRow.organizationId,
      userId,
      waiverName,
      metadata: md,
    });

    // Confirmation email is dispatched AFTER the tx commits (see below), not
    // here — an un-awaited send inside the tx is dropped when the serverless
    // function freezes after responding.

    // Revenue event — no DB access, so safe inside the tx.
    // Brand-attributed for two-brand segmentation.
    capturePaymentCompleted({
      distinctId: userId,
      clientDistinctId: md.ph_distinct_id,
      kind: "dropin",
      amountCents: input.amountTotalCents,
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
      paidCents: input.amountTotalCents,
    };
  });

  // Duplicate-user outcome: decide (outside the tx) whether this charge is a
  // LIVE duplicate that must be refunded or a harmless redelivery.
  if (txResult.status === "duplicate_user") {
    const baseReason = `user ${userId} already has an active booking (${txResult.activeStatus}) on session ${sessionDbId}`;
    if (!paymentIntentId) {
      return { status: "skipped", reason: baseReason };
    }
    return {
      status: "skipped",
      reason: `${baseReason} — ${await resolveDuplicateUserCharge(paymentIntentId)}`,
    };
  }

  const result: HandlerResult = txResult;

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

    const hasConversionSignal =
      md.ga_client_id || md.fbclid || md._fbc || md._fbp || input.customerEmail;
    if (hasConversionSignal) {
      const amount = input.amountTotalCents;
      fireServerPurchaseConversions({
        metadata: md,
        eventId: paymentIntentId ?? input.fallbackEventId,
        valueCents: amount,
        brand,
        email: input.customerEmail,
        userId,
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
 * Write the canonical annual liability consent for a signature captured at
 * the paid CHILD door, inside the caller's transaction.
 *
 * No-op unless BOTH a `family_members` participant and a fresh signature are
 * present — an adult drop-in has no person row to key the org-scoped
 * predicate on (its waiver is captured post-payment on the session page), and
 * the waiver-on-file branch deliberately writes nothing: per
 * `recordLiabilityWaiver`'s caller contract the writer is append-only and
 * must only ever see a signature a human actually just gave.
 *
 * IP/user-agent come from the checkout metadata rather than a request — this
 * runs in a Stripe webhook, which has no request context of its own; the
 * booking endpoint captured them at signing time (see
 * api/dropin/bookings/index.ts).
 *
 * Replay safety comes from the callers, not from here: `recordLiabilityWaiver`
 * does not dedupe, but every path into it is downstream of the stripe_events
 * ledger, the PaymentIntent-id row lookup, and the duplicate-participant
 * guard — a redelivered event never reaches an insert.
 */
async function recordFreshGuardianWaiver(
  tx: Tx,
  opts: {
    familyMemberId: string | null;
    organizationId: string;
    userId: string;
    waiverName: string | null;
    metadata: Record<string, string>;
  },
): Promise<void> {
  if (!opts.familyMemberId || !opts.waiverName) return;
  await recordLiabilityWaiver(
    {
      familyMemberId: opts.familyMemberId,
      organizationId: opts.organizationId,
      signedByUserId: opts.userId,
      signedByName: opts.waiverName,
      consentVariant: "guardian",
      // The text the modal showed the signer — one source, shared by every
      // drop-in waiver surface (src/lib/dropin/waiver-text.ts). It is far too
      // long for a Stripe metadata value, so it is resolved here rather than
      // round-tripped through the payment.
      consentText: DROPIN_WAIVER_TEXT,
      ipAddress: opts.metadata.waiver_ip || null,
      userAgent: opts.metadata.waiver_ua || null,
    },
    tx,
  );
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
    // Self-heal: Stripe refuses to refund an already-fully-refunded charge.
    // That means the money is ALREADY back with the customer — most likely
    // an out-of-band refund (staff via the dashboard after a
    // dropin_overflow_refund_failed alert). Resolve the refund id from the
    // PaymentIntent and stamp the row so the durable marker is armed and
    // the row becomes promotable again (unsettled overflow rows are
    // deliberately excluded from waitlist promotion).
    if (isAlreadyRefundedError(err)) {
      try {
        const refunds = await stripe.refunds.list({
          payment_intent: paymentIntentId,
          limit: 1,
        });
        const settled = refunds.data[0];
        if (settled) {
          await db
            .update(dropInBookings)
            .set({ stripeRefundId: settled.id, updatedAt: new Date() })
            .where(eq(dropInBookings.id, bookingId));
          await logAlert("dropin_overflow_refunded", {
            message:
              "checkout overflow — charge was already refunded out-of-band; stamped the settled refund on the row",
            bookingId,
            stripePaymentIntentId: paymentIntentId,
            stripeRefundId: settled.id,
          });
          await awaitDispatch(
            "dropin overflow refunded",
            () => dispatchOverflowRefunded(bookingId),
            { bookingId, brand },
          );
          return;
        }
      } catch {
        // Fall through to the generic failure alert below.
      }
    }
    const message = err instanceof Error ? err.message : String(err);
    await logAlert("dropin_overflow_refund_failed", {
      bookingId,
      stripePaymentIntentId: paymentIntentId,
      error: message,
    });
  }
}

/** Stripe refuses a second full refund of the same charge with this error
 *  code — for our purposes that means "the money is already back". */
function isAlreadyRefundedError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: string }).code === "charge_already_refunded"
  );
}

/**
 * A completed checkout whose PaymentIntent is recorded on NO booking row,
 * for a user who already holds an active booking on the session. Two ways
 * to get here:
 *
 *   - LIVE duplicate: the customer paid twice (e.g. two checkout tabs; the
 *     pre-mint 409 in bookings/index.ts kills most of these, but two
 *     concurrent first-time checkouts can both mint). The second charge
 *     bought nothing → refund it, loudly.
 *   - Redelivery: the original overflow charge was refunded and the row's
 *     PI was later replaced by a claim payment — the incoming PI is already
 *     fully refunded, so the refund attempt is refused by Stripe and we
 *     skip quietly.
 *
 * The refund attempt itself is the discriminator: `charge_already_refunded`
 * = redelivery; success = live duplicate (idempotency key
 * `${pi.id}:duplicate-refund` dedupes concurrent deliveries). No row is
 * stamped — no row owns this PaymentIntent.
 *
 * Returns the reason suffix for the handler's skip result.
 */
async function resolveDuplicateUserCharge(
  paymentIntentId: string,
): Promise<string> {
  if (!stripe) {
    await logAlert("dropin_duplicate_refund_failed", {
      stripePaymentIntentId: paymentIntentId,
      error: "stripe-not-configured",
    });
    return `duplicate charge NOT refunded (stripe not configured) — manual refund required for ${paymentIntentId}`;
  }
  try {
    const refund = await stripe.refunds.create(
      { payment_intent: paymentIntentId },
      { idempotencyKey: `${paymentIntentId}:duplicate-refund` },
    );
    // LOUD: money moved without a human in the loop.
    await logAlert("dropin_duplicate_refunded", {
      message:
        "duplicate paid checkout for a user with an existing active booking — charge auto-refunded",
      stripePaymentIntentId: paymentIntentId,
      stripeRefundId: refund.id,
    });
    return `duplicate charge auto-refunded (${refund.id})`;
  } catch (err) {
    if (isAlreadyRefundedError(err)) {
      // Redelivery of a charge whose refund already settled — quiet skip.
      return `charge already refunded — redelivery`;
    }
    const message = err instanceof Error ? err.message : String(err);
    await logAlert("dropin_duplicate_refund_failed", {
      stripePaymentIntentId: paymentIntentId,
      error: message,
    });
    return `duplicate charge refund FAILED — manual refund required for ${paymentIntentId}`;
  }
}
