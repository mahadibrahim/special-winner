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
 */
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { memberships } from "@/lib/db/schema/memberships";
import { payments } from "@/lib/db/schema/payments";

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
  if (!membership) return; // drop-league or unknown sub — not ours
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
