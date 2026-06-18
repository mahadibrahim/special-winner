/**
 * Shared Stripe Checkout creation for paid drop-in bookings — used by the
 * authed booking endpoint (/api/dropin/bookings) and the guest endpoint
 * (/api/dropin/guest-checkout). Keeping it in one place means the webhook
 * fulfillment contract (metadata shape consumed by the
 * `checkout.session.completed` handler) has exactly one producer pair.
 *
 * Marketplace fee: when the venue carries `partnerStripeAccountId`, the
 * Checkout Session uses Connect `transfer_data` so funds settle on the
 * partner account net of our `partnerApplicationFeePct` cut. The card
 * surcharge is our cost recovery, not partner revenue — clawed back via
 * the application fee.
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

export async function createDropInCheckoutSession(opts: {
  db: ReturnType<typeof getDb>;
  session: typeof dropInSessions.$inferSelect;
  user: { id: string; email: string };
  rate: ResolvedRate;
  waiverSignedAt: Date;
  waiverName: string;
  extraMetadata?: Record<string, string>;
  /** Request origin (e.g. `url.origin`) — success/cancel redirects return to
   *  the domain the customer booked from. Falls back to PUBLIC_APP_URL. */
  origin?: string;
}): Promise<{ checkoutUrl: string | null; checkoutSessionId: string }> {
  const { db, session, user, rate, waiverSignedAt, waiverName } = opts;

  if (!stripe) {
    throw new Error("Stripe not configured");
  }

  const [venue] = await db
    .select()
    .from(venues)
    .where(eq(venues.id, session.venueId))
    .limit(1);

  const [org] = await db
    .select({ timezone: organizations.timezone })
    .from(organizations)
    .where(eq(organizations.id, session.organizationId))
    .limit(1);

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

  const appUrl = opts.origin ?? import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    customer_email: user.email,
    line_items: buildDropInCheckoutLineItems({
      sportOrClassLabel: session.sportOrClassLabel,
      formatLabel: session.formatLabel,
      startsAt: session.startsAt,
      venueName: venue?.name ?? null,
      timezone: org?.timezone ?? null,
      baseAmountCents: rate.amountCents,
      surchargeCents,
    }),
    metadata: {
      type: "dropin_booking",
      session_id: session.id,
      user_id: user.id,
      payment_method: rate.paymentMethod,
      membership_id: rate.membershipId ?? "",
      organization_id: session.organizationId,
      waiver_signed_at: waiverSignedAt.toISOString(),
      waiver_name: waiverName,
      ...(opts.extraMetadata ?? {}),
    },
    payment_intent_data: {
      description: paymentDescription,
      ...(partnerStripeAccountId
        ? {
            application_fee_amount: applicationFeeCents,
            transfer_data: { destination: partnerStripeAccountId },
          }
        : {}),
    },
    // Carry the checkout session id back so the success page can resolve the
    // booking for guests who aren't signed in (existing-account guests don't
    // get a login session — see guest-checkout). Stripe substitutes the
    // literal {CHECKOUT_SESSION_ID} placeholder with the real id.
    success_url: `${appUrl}/dropin/${session.id}?booking=success&checkout_session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/dropin/${session.id}?booking=cancelled`,
  });

  return { checkoutUrl: checkoutSession.url, checkoutSessionId: checkoutSession.id };
}
