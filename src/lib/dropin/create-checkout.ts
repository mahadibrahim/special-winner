/**
 * Shared Stripe payment creation for paid drop-in bookings — used by the
 * authed booking endpoint (/api/dropin/bookings) and the guest endpoint
 * (/api/dropin/guest-checkout). Keeping it in one place means the webhook
 * fulfillment contract (metadata shape consumed by the booking-inserting
 * webhook handlers) has exactly one producer pair.
 *
 * Two producers, one contract:
 *   - `createDropInPaymentIntent` — the CURRENT flow: a bare PaymentIntent
 *     confirmed by the inline deferred Payment Element on the session page
 *     (metadata.type "dropin_booking_embedded", fulfilled by
 *     `payment_intent.succeeded` → handle-dropin-booking-payment.ts).
 *   - `createDropInCheckoutSession` — the LEGACY hosted Checkout flow
 *     (metadata.type "dropin_booking", fulfilled by
 *     `checkout.session.completed` → handle-dropin-checkout-complete.ts).
 *     Kept intact for in-flight sessions and as the claim-payment flow's
 *     vehicle (see `overrides`).
 * Both stamp the SAME metadata keys; both fulfillment handlers funnel into
 * the shared `fulfillDropInBookingPayment`.
 *
 * Marketplace fee: when the venue carries `partnerStripeAccountId`, the
 * payment uses Connect `transfer_data` so funds settle on the partner
 * account net of our `partnerApplicationFeePct` cut. The card surcharge is
 * our cost recovery, not partner revenue — clawed back via the application
 * fee.
 */
import { eq } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import type { dropInSessions } from "@/lib/db/schema/drop-in";
import { venues } from "@/lib/db/schema/teams";
import { organizations } from "@/lib/db/schema/organizations";
import { stripe } from "@/lib/stripe/client";
import type { ResolvedRate } from "@/lib/dropin/pricing";
import {
  buildDropInCheckoutLineItems,
  dropInPaymentDescription,
} from "@/lib/dropin/checkout-line-item";
import { computeSurchargeCents } from "@/lib/payments/surcharge";
import { sanitizeReferralSource } from "@/lib/dropin/booking";

/**
 * Charge math + copy shared by both producers: venue/org context, card
 * surcharge, Connect application-fee split, and the human-readable payment
 * description. One computation so hosted Checkout and the embedded
 * PaymentIntent can never drift on money.
 */
async function resolveDropInChargeContext(
  db: ReturnType<typeof getDb>,
  session: typeof dropInSessions.$inferSelect,
  rate: ResolvedRate,
): Promise<{
  venueName: string | null;
  timezone: string | null;
  surchargeCents: number;
  totalCents: number;
  partnerStripeAccountId: string | null;
  applicationFeeCents: number | undefined;
  paymentDescription: string;
}> {
  // venue and org are independent reads (different tables, different scope
  // columns, neither depends on the other's result) — fetch concurrently.
  const [[venue], [org]] = await Promise.all([
    db.select().from(venues).where(eq(venues.id, session.venueId)).limit(1),
    db
      .select({ timezone: organizations.timezone })
      .from(organizations)
      .where(eq(organizations.id, session.organizationId))
      .limit(1),
  ]);

  // Drop-in checkout is card-only, so the card surcharge always applies.
  const surchargeCents = computeSurchargeCents(rate.amountCents, "card");

  const partnerStripeAccountId = venue?.partnerStripeAccountId ?? null;
  const applicationFeePct = venue?.partnerApplicationFeePct ?? 0;
  const applicationFeeCents = partnerStripeAccountId
    ? Math.round((rate.amountCents * applicationFeePct) / 100) + surchargeCents
    : undefined;

  // Human-readable description for the PaymentIntent — what shows in the
  // Stripe dashboard payment list and on refunds (Stripe otherwise falls
  // back to the raw pi_… id).
  const paymentDescription = dropInPaymentDescription({
    sportOrClassLabel: session.sportOrClassLabel,
    formatLabel: session.formatLabel,
    startsAt: session.startsAt,
    venueName: venue?.name ?? null,
    timezone: org?.timezone ?? null,
  });

  return {
    venueName: venue?.name ?? null,
    timezone: org?.timezone ?? null,
    surchargeCents,
    totalCents: rate.amountCents + surchargeCents,
    partnerStripeAccountId,
    applicationFeeCents,
    paymentDescription,
  };
}

/**
 * Fulfillment metadata — the contract consumed by
 * `fulfillDropInBookingPayment` (handle-dropin-checkout-complete.ts).
 * Stamped identically on the hosted Checkout Session and the embedded
 * PaymentIntent, differing only in `type`. All values are strings ≤500
 * chars (Stripe metadata limit).
 */
function buildDropInFulfillmentMetadata(opts: {
  type: string;
  session: typeof dropInSessions.$inferSelect;
  user: { id: string };
  rate: ResolvedRate;
  waiverSignedAt: Date;
  waiverName: string;
  referralSource?: string;
  extraMetadata?: Record<string, string>;
}): Record<string, string> {
  return {
    type: opts.type,
    session_id: opts.session.id,
    user_id: opts.user.id,
    payment_method: opts.rate.paymentMethod,
    membership_id: opts.rate.membershipId ?? "",
    organization_id: opts.session.organizationId,
    waiver_signed_at: opts.waiverSignedAt.toISOString(),
    waiver_name: opts.waiverName,
    referral_source: sanitizeReferralSource(opts.referralSource) ?? "",
    ...(opts.extraMetadata ?? {}),
  };
}

/**
 * Deferred-intent producer for the inline Payment Element flow. Creates a
 * bare PaymentIntent carrying the full fulfillment contract; the booking
 * row is inserted by `payment_intent.succeeded` →
 * handle-dropin-booking-payment.ts (metadata.type
 * "dropin_booking_embedded"). Called on Pay, so an abandoned card form
 * leaves nothing behind but an unconfirmed intent that expires on its own.
 */
export async function createDropInPaymentIntent(opts: {
  db: ReturnType<typeof getDb>;
  session: typeof dropInSessions.$inferSelect;
  user: { id: string; email: string };
  rate: ResolvedRate;
  waiverSignedAt: Date;
  waiverName: string;
  /** Raw `?src=` query value from the share link — sanitized before it lands
   *  in intent metadata (and, later, the booking row via the webhook). */
  referralSource?: string;
  extraMetadata?: Record<string, string>;
  /** Dedupes concurrent duplicate create calls for the same booking attempt
   *  into one PaymentIntent (client mints a fresh attempt id per Pay click,
   *  so a retry after a decline gets a new intent as intended). */
  idempotencyKey?: string;
}): Promise<{
  clientSecret: string;
  paymentIntentId: string;
  amountCents: number;
}> {
  const { db, session, user, rate } = opts;

  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const charge = await resolveDropInChargeContext(db, session, rate);

  const paymentIntent = await stripe.paymentIntents.create(
    {
      amount: charge.totalCents,
      currency: "usd",
      payment_method_types: ["card"],
      receipt_email: user.email,
      description: charge.paymentDescription,
      metadata: buildDropInFulfillmentMetadata({
        type: "dropin_booking_embedded",
        session,
        user,
        rate,
        waiverSignedAt: opts.waiverSignedAt,
        waiverName: opts.waiverName,
        referralSource: opts.referralSource,
        extraMetadata: opts.extraMetadata,
      }),
      ...(charge.partnerStripeAccountId
        ? {
            application_fee_amount: charge.applicationFeeCents,
            transfer_data: { destination: charge.partnerStripeAccountId },
          }
        : {}),
    },
    opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined,
  );

  if (!paymentIntent.client_secret) {
    throw new Error("PaymentIntent created without a client secret");
  }

  return {
    clientSecret: paymentIntent.client_secret,
    paymentIntentId: paymentIntent.id,
    amountCents: charge.totalCents,
  };
}

export async function createDropInCheckoutSession(opts: {
  db: ReturnType<typeof getDb>;
  session: typeof dropInSessions.$inferSelect;
  user: { id: string; email: string };
  rate: ResolvedRate;
  waiverSignedAt: Date;
  waiverName: string;
  /** Raw `?src=` query value from the share link — sanitized before it lands
   *  in Checkout metadata (and, later, the booking row via the webhook). */
  referralSource?: string;
  extraMetadata?: Record<string, string>;
  /** Request origin (e.g. `url.origin`) — success/cancel redirects return to
   *  the domain the customer booked from. Falls back to PUBLIC_APP_URL. */
  origin?: string;
  /**
   * Fulfillment-contract overrides — used by the claim-payment flow
   * (api/dropin/claim/[token].ts), which pays for an EXISTING pending_claim
   * booking row instead of creating a new one on webhook:
   *   - `metadataType` replaces the checkout session's `metadata.type`
   *     ("dropin_booking" by default) so checkout.session.completed does NOT
   *     route to the row-inserting handler;
   *   - `paymentIntentMetadata` is stamped onto the PaymentIntent so
   *     payment_intent.succeeded routes to the row-flipping handler;
   *   - `idempotencyKey` dedupes repeated create calls (e.g. double-clicked
   *     "Pay" button) into one Checkout Session / one PaymentIntent, the
   *     same protection walkin/payment.ts gets from its PI idempotency key.
   * Default (undefined) preserves the original booking-flow contract.
   */
  overrides?: {
    metadataType: string;
    paymentIntentMetadata: Record<string, string>;
    idempotencyKey: string;
  };
}): Promise<{ checkoutUrl: string | null; checkoutSessionId: string }> {
  const { db, session, user, rate, waiverSignedAt, waiverName } = opts;

  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const charge = await resolveDropInChargeContext(db, session, rate);

  const appUrl = opts.origin ?? import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  const checkoutSession = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      payment_method_types: ["card"],
      customer_email: user.email,
      line_items: buildDropInCheckoutLineItems({
        sportOrClassLabel: session.sportOrClassLabel,
        formatLabel: session.formatLabel,
        startsAt: session.startsAt,
        venueName: charge.venueName,
        timezone: charge.timezone,
        baseAmountCents: rate.amountCents,
        surchargeCents: charge.surchargeCents,
      }),
      metadata: buildDropInFulfillmentMetadata({
        type: opts.overrides?.metadataType ?? "dropin_booking",
        session,
        user,
        rate,
        waiverSignedAt,
        waiverName,
        referralSource: opts.referralSource,
        extraMetadata: opts.extraMetadata,
      }),
      payment_intent_data: {
        description: charge.paymentDescription,
        ...(opts.overrides?.paymentIntentMetadata
          ? { metadata: opts.overrides.paymentIntentMetadata }
          : {}),
        ...(charge.partnerStripeAccountId
          ? {
              application_fee_amount: charge.applicationFeeCents,
              transfer_data: { destination: charge.partnerStripeAccountId },
            }
          : {}),
      },
      // Carry the checkout session id back so the success page can resolve the
      // booking for guests who aren't signed in (existing-account guests don't
      // get a login session — see guest-checkout). Stripe substitutes the
      // literal {CHECKOUT_SESSION_ID} placeholder with the real id.
      success_url: `${appUrl}/dropin/${session.id}?booking=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/dropin/${session.id}?booking=cancelled`,
    },
    opts.overrides?.idempotencyKey
      ? { idempotencyKey: opts.overrides.idempotencyKey }
      : undefined,
  );

  return { checkoutUrl: checkoutSession.url, checkoutSessionId: checkoutSession.id };
}
