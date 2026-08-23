/**
 * invoice.paid → payments ledger. Closes the gap where month-2+
 * subscription revenue was invisible to admin reporting: every paid
 * subscription invoice (first and recurring, memberships and drop-league)
 * lands as a payments row.
 *
 * Idempotent: payments has a partial unique index on
 * stripe_payment_intent_id (WHERE stripe_payment_intent_id IS NOT NULL);
 * onConflictDoNothing targets it with the matching WHERE clause (see
 * handle-team-deposit-succeeded.ts for the same pattern) so a redelivered
 * invoice.paid for the same PaymentIntent doesn't double-insert. That's a
 * belt-and-braces secondary check — the primary idempotency guard is the
 * stripe_events claim in handle-stripe-event.ts, which short-circuits
 * redeliveries of the same Stripe event id before dispatch ever runs.
 * Invoices paid entirely via customer balance/credit (rare) carry no
 * payment_intent and fall outside the partial index's protection — same
 * residual gap the PaymentIntent-keyed dedupe in handle-team-deposit-
 * succeeded.ts already accepts, covered by the event-level claim instead.
 * Zero-amount invoices are skipped by invoiceToLedgerRow.
 *
 * invoice.paid fires for BOTH membership subscriptions and drop-league
 * subscriptions (same platform Stripe account, same event stream — see the
 * payment-systems note in handle-stripe-event.ts). handleInvoicePaid only
 * looks up `memberships`; when the invoice's subscription doesn't match any
 * membership row, it's a drop-league invoice (or unknown) and is skipped
 * here. That's correct for this task — a drop-league ledger entry is a
 * separate, out-of-scope concern.
 *
 * ONE exception to that skip: a missing membership row can also mean the
 * row isn't inserted YET. Stripe does not guarantee ordering between
 * `checkout.session.completed` (which inserts the memberships row) and the
 * `invoice.paid` for that subscription's first invoice. Returning cleanly in
 * that case permanently consumes the event — handle-stripe-event.ts claims
 * the event id in `stripe_events` BEFORE dispatch and only releases the
 * claim when dispatch throws — so the first invoice's revenue would never
 * reach the ledger. When the subscription is provably ours we therefore
 * THROW, releasing the claim so Stripe's retry (by which time the row
 * exists) records it.
 */
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";
import { payments } from "@/lib/db/schema/payments";
import { membershipsStripe } from "./stripe";

export function invoiceToLedgerRow(
  invoice: Stripe.Invoice,
  membership: { id: string; userId: string },
) {
  if (!invoice.amount_paid || invoice.amount_paid <= 0) return null;
  const pi =
    typeof invoice.payment_intent === "string"
      ? invoice.payment_intent
      : invoice.payment_intent?.id ?? null;
  const charge =
    typeof invoice.charge === "string" ? invoice.charge : invoice.charge?.id ?? null;
  return {
    membershipId: membership.id,
    userId: membership.userId,
    amountCents: invoice.amount_paid,
    paymentType: "membership" as const,
    status: "succeeded" as const,
    stripePaymentIntentId: pi,
    stripeChargeId: charge,
    metadata: { stripe_invoice_id: invoice.id },
  };
}

/**
 * Is this invoice's subscription one of OUR membership subscriptions,
 * judged from the invoice payload alone (no Stripe API call)?
 *
 * Membership subscriptions are created with
 * `subscription_data.metadata.type = "membership_subscription"` (see
 * buildSubscriptionCheckoutParams in ./stripe.ts). Stripe snapshots that
 * metadata onto the invoice at finalization, exposed as
 * `parent.subscription_details.metadata` (and as the legacy top-level
 * `subscription_details.metadata` on older API versions).
 *
 * Returns:
 *   true  — ours (membership)
 *   false — definitely not ours (drop-league or unrelated)
 *   null  — undecidable from the payload; the caller must retrieve the
 *           subscription. An EMPTY metadata object counts as undecidable:
 *           our subscriptions always carry `type`, so an empty snapshot
 *           means the payload just isn't carrying it.
 */
export function membershipMarkerFromInvoice(
  invoice: Stripe.Invoice,
): boolean | null {
  const legacy = invoice as unknown as {
    subscription_details?: { metadata?: Stripe.Metadata | null } | null;
    subscription?: string | Stripe.Subscription | null;
  };
  const metadata =
    invoice.parent?.subscription_details?.metadata ??
    legacy.subscription_details?.metadata ??
    (legacy.subscription && typeof legacy.subscription === "object"
      ? legacy.subscription.metadata
      : null);
  if (!metadata || Object.keys(metadata).length === 0) return null;
  return metadata.type === "membership_subscription";
}

export async function handleInvoicePaid(invoice: Stripe.Invoice): Promise<void> {
  if (!invoice.subscription) return;
  const subscriptionId =
    typeof invoice.subscription === "string"
      ? invoice.subscription
      : invoice.subscription.id;
  const db = getDb();
  const [membership] = await db
    .select({ id: memberships.id, userId: memberships.userId })
    .from(memberships)
    .where(eq(memberships.stripeSubscriptionId, subscriptionId))
    .limit(1); // unique column — at most one row
  if (!membership) {
    // No row — either genuinely not ours, or ours-but-not-inserted-yet (the
    // checkout.session.completed / invoice.paid ordering race described in
    // the module header). Decide from the invoice payload first; only pay
    // for a subscriptions.retrieve when the payload can't tell us.
    let isMembershipSub = membershipMarkerFromInvoice(invoice);
    if (isMembershipSub === null) {
      // A retrieve failure is itself "undecided" — let it propagate so the
      // event claim is released and Stripe retries, rather than guessing
      // "not ours" and dropping a membership payment.
      const sub = await membershipsStripe().subscriptions.retrieve(subscriptionId);
      isMembershipSub = sub.metadata?.type === "membership_subscription";
    }
    if (isMembershipSub) {
      throw new Error(
        `[memberships] invoice.paid ${invoice.id} for membership subscription ${subscriptionId} arrived before the membership row existed — throwing so the stripe_events claim is released and Stripe retries`,
      );
    }
    return; // drop-league or unrelated subscription — not ours
  }
  const row = invoiceToLedgerRow(invoice, membership);
  if (!row) return;
  await db
    .insert(payments)
    .values(row)
    .onConflictDoNothing({
      target: payments.stripePaymentIntentId,
      where: sql`stripe_payment_intent_id IS NOT NULL`,
    });
}
