/**
 * Platform-webhook handlers for drop-league subscription lifecycle events.
 *
 * Idempotent: checkout-completed is keyed on `dropPlayerId` (one active sub
 * per player) via ON CONFLICT DO UPDATE; subscription.updated/deleted are
 * keyed on `stripeSubscriptionId` and no-op when no matching row exists
 * (safe to fan-out alongside the membership handlers on every subscription
 * event without side-effects on non-Drop subs).
 */
import type Stripe from "stripe";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropSubscriptions } from "@/lib/db/schema/drop-league";

/**
 * `checkout.session.completed` for `mode === 'subscription'` with
 * `metadata.type === "drop_subscription"`. UPSERTs the `drop_subscriptions`
 * row keyed on `dropPlayerId` — one active subscription per player at a time.
 *
 * `currentPeriodEnd` is left for the subsequent
 * `customer.subscription.updated` event (which fires immediately after
 * checkout completion) to populate, matching the membership handler pattern
 * of not fetching the subscription object inline during checkout-completed.
 */
export async function handleDropCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  if (session.mode !== "subscription") return;
  if (session.metadata?.type !== "drop_subscription") return;
  if (!session.subscription) return;

  const dropPlayerId = session.metadata.drop_player_id;
  const organizationId = session.metadata.organization_id;
  const userId = session.metadata.user_id;

  if (!dropPlayerId || !organizationId) {
    console.error(
      "[drop/webhook] missing metadata on checkout session",
      session.id,
    );
    return;
  }

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription.id;
  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id;

  const db = getDb();
  await db
    .insert(dropSubscriptions)
    .values({
      dropPlayerId,
      organizationId,
      userId: userId ?? null,
      status: "active",
      stripeCustomerId: customerId ?? null,
      stripeSubscriptionId: subscriptionId,
      registrationFeePaid: true,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: dropSubscriptions.dropPlayerId,
      set: {
        status: "active",
        stripeCustomerId: customerId ?? null,
        stripeSubscriptionId: subscriptionId,
        registrationFeePaid: true,
        updatedAt: new Date(),
      },
    });
}

/**
 * Subscription updates — status flips, period rollovers,
 * cancel-at-period-end toggles. No-ops when no row with this
 * `stripeSubscriptionId` exists (non-Drop subs are unaffected).
 */
export async function handleDropSubscriptionUpdated(
  sub: Stripe.Subscription,
): Promise<void> {
  const db = getDb();
  const status = mapDropStripeStatus(sub);
  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;

  await db
    .update(dropSubscriptions)
    .set({
      status,
      currentPeriodEnd,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .where(eq(dropSubscriptions.stripeSubscriptionId, sub.id));
}

/**
 * Subscription deleted — final cancellation. Sets `status = 'cancelled'`,
 * stamps `cancelledAt`. No-op on non-Drop subs.
 */
export async function handleDropSubscriptionDeleted(
  sub: Stripe.Subscription,
): Promise<void> {
  const db = getDb();
  await db
    .update(dropSubscriptions)
    .set({
      status: "cancelled",
      cancelledAt: new Date(),
      cancelAtPeriodEnd: false,
      updatedAt: new Date(),
    })
    .where(eq(dropSubscriptions.stripeSubscriptionId, sub.id));
}

/**
 * Invoice payment failed — surfaces `past_due` to the player dashboard.
 * Only transitions rows that are currently `active` to avoid overwriting a
 * manually-cancelled row. No-op on non-Drop subs.
 */
export async function handleDropInvoicePaymentFailed(
  invoice: Stripe.Invoice,
): Promise<void> {
  if (!invoice.subscription) return;
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription.id;

  const db = getDb();
  await db
    .update(dropSubscriptions)
    .set({ status: "past_due", updatedAt: new Date() })
    .where(
      and(
        eq(dropSubscriptions.stripeSubscriptionId, subscriptionId),
        // Don't overwrite a manually-cancelled row.
        eq(dropSubscriptions.status, "active"),
      ),
    );
}

function mapDropStripeStatus(
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
