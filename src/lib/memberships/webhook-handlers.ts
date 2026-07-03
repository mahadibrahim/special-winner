/**
 * Connect-webhook handlers for subscription lifecycle events.
 *
 * Idempotent: each handler is keyed on `stripeSubscriptionId` (a UNIQUE
 * column on the memberships table) and is safe to replay. The webhook
 * endpoint does signature verification + dispatch only.
 */
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";
import { fireServerPurchaseConversions } from "@/lib/analytics/server-conversions";
import { sendOpsPing } from "@/lib/ops/ping";

/**
 * `checkout.session.completed` for `mode === 'subscription'` with our
 * type metadata. Inserts the membership row in `active` status.
 *
 * `ON CONFLICT (stripe_subscription_id) DO NOTHING` makes this safe on
 * webhook retry: if a previous delivery already inserted the row, the
 * second attempt is a no-op rather than a unique-key violation.
 */
export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription") return;
  if (session.metadata?.type !== "membership_subscription") return;
  if (!session.subscription) return;

  const userId = session.metadata.user_id;
  const organizationId = session.metadata.organization_id;
  const tierId = session.metadata.tier_id;
  const billingInterval = session.metadata.billing_interval as
    | "month"
    | "year"
    | undefined;
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;
  if (!userId || !organizationId || !tierId || !billingInterval) {
    console.error("[memberships/webhook] missing metadata on session", session.id);
    return;
  }

  const db = getDb();
  const inserted = await db
    .insert(memberships)
    .values({
      userId,
      organizationId,
      tierId,
      status: "active",
      billingInterval,
      stripeSubscriptionId: subscriptionId,
      stripeCustomerId: customerId ?? null,
    })
    .onConflictDoNothing({ target: memberships.stripeSubscriptionId })
    .returning({ id: memberships.id });

  // Only fire revenue analytics + ad conversions on the genuine first insert,
  // not on a webhook retry that hits the ON CONFLICT no-op (the upstream
  // stripe_events ledger already dedupes, this is belt-and-braces).
  if (inserted.length === 0) return;

  const brand = normalizeBrand(session.metadata?.brand);
  const amountCents = session.amount_total ?? 0;
  const md = session.metadata ?? {};
  const memberLabel =
    session.customer_details?.email ?? session.customer_email ?? userId;
  const tierName = md.tier_name || "Membership";

  void sendOpsPing(organizationId, {
    kind: "membership_started",
    brand,
    eventId: inserted[0].id,
    label: `${memberLabel} · ${tierName}`,
    amountCents,
  });

  capturePaymentCompleted({
    distinctId: userId,
    kind: "membership",
    amountCents,
    brand,
    organizationId,
    metadata: {
      membership_id: inserted[0].id,
      tier_id: tierId,
      billing_interval: billingInterval,
      subscription_id: subscriptionId,
    },
  });

  // Online membership signup is an ad-attributable path. Subscription-mode
  // sessions have no PaymentIntent, so the Checkout Session id is the dedup
  // key shared with the browser pixel fire on the success page.
  const hasAttribution = md.ga_client_id || md.fbclid || md._fbc || md._fbp;
  if (hasAttribution) {
    fireServerPurchaseConversions({
      metadata: md,
      eventId: session.id,
      valueCents: amountCents,
      brand,
      email: session.customer_details?.email ?? session.customer_email ?? null,
      ga4Items: [
        { id: tierId, name: tierName, category: "Membership", priceCents: amountCents },
      ],
      ga4PaymentType: "full",
      contentIds: [tierId],
      contentName: tierName,
      contentCategory: "membership",
    });
  }
}

/**
 * Subscription updates — status flips (`active` ↔ `past_due` ↔ `paused`),
 * period rollovers, cancel-at-period-end toggles.
 */
export async function handleSubscriptionUpdated(
  sub: Stripe.Subscription,
): Promise<void> {
  const db = getDb();
  const status = mapStripeStatus(sub);
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;
  const pausedAt = sub.pause_collection ? new Date() : null;
  const pauseResumesAt = sub.pause_collection?.resumes_at
    ? new Date(sub.pause_collection.resumes_at * 1000)
    : null;

  await db
    .update(memberships)
    .set({
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      pausedAt,
      pauseResumesAt,
      updatedAt: new Date(),
    })
    .where(eq(memberships.stripeSubscriptionId, sub.id));
}

/**
 * Subscription deleted — final cancellation. Sets `status = 'cancelled'`,
 * stamps `cancelledAt`.
 */
export async function handleSubscriptionDeleted(
  sub: Stripe.Subscription,
): Promise<void> {
  const db = getDb();
  await db
    .update(memberships)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(memberships.stripeSubscriptionId, sub.id));
}

/**
 * Invoice payment failed — Stripe will retry per dunning settings; we
 * surface `past_due` to the customer dashboard so they can update card.
 */
export async function handleInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.subscription) return;
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription.id;
  const db = getDb();
  await db
    .update(memberships)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(
      and(
        eq(memberships.stripeSubscriptionId, subscriptionId),
        // Don't overwrite a manually-cancelled row.
        eq(memberships.status, "active"),
      ),
    );
}

function mapStripeStatus(
  sub: Stripe.Subscription,
): "active" | "paused" | "past_due" | "cancelled" | "incomplete" {
  if (sub.pause_collection) return "paused";
  switch (sub.status) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
      return "cancelled";
    case "incomplete":
    case "incomplete_expired":
      return "incomplete";
    default:
      return "active";
  }
}
