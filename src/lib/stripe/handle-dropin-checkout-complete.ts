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
import { awaitDispatch } from "@/lib/notifications/await-dispatch";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { fireServerPurchaseConversions } from "@/lib/analytics/server-conversions";

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

  // Captured inside the tx, used after commit to build GA4/Meta item context.
  let itemLabel = "";
  let itemCategory = "";

  const result:
    | { status: "skipped"; reason: string }
    | { status: "processed"; bookingId: string; paidCents: number } =
    await db.transaction(async (tx) => {
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

    itemCategory = sessionRow.sportOrClassLabel;
    itemLabel = sessionRow.formatLabel
      ? `${sessionRow.sportOrClassLabel} ${sessionRow.formatLabel}`
      : sessionRow.sportOrClassLabel;

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

  // Server-side ad conversions (GA4 MP + Meta CAPI) — online drop-in is an
  // ad-attributable path. Fired after the tx (the GA4 item context is built
  // from the captured session labels; no DB query needed here). Deduped
  // against the browser pixel by the PaymentIntent id.
  if (result.status === "processed") {
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
