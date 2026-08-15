/**
 * Stripe webhook handler for a rental block's DEPOSIT.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "checkout.session.completed"` AND
 * `metadata.type === "rental_block_deposit"`.
 *
 * All the state work lives in `applyDepositPaid` so the transition is
 * testable without Stripe: this file is metadata extraction plus telemetry.
 * Idempotent on duplicate deliveries via the upstream `stripe_events` ledger
 * plus the status guard inside `applyDepositPaid`.
 */
import type Stripe from "stripe";
import { applyDepositPaid } from "@/lib/rentals/blocks/lifecycle";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";

export async function handleRentalBlockDepositComplete(
  session: Stripe.Checkout.Session,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; blockId: string; paidCents: number }
> {
  const blockId = session.metadata?.block_id;
  if (!blockId) return { status: "skipped", reason: "missing block_id metadata" };

  const paymentIntentId = (session.payment_intent as string) ?? null;
  const paidCents = session.amount_total ?? 0;

  const result = await applyDepositPaid(blockId, paymentIntentId, paidCents);
  if (!result.ok) {
    return { status: "skipped", reason: result.reason ?? "deposit not applied" };
  }

  // Revenue analytics. Guests have no user id to attribute to, and blocks are
  // admin-originated rather than ad-attributable, so this is the only
  // telemetry the block path fires (no server-side ad conversions).
  const md = session.metadata ?? {};
  if (md.renter_user_id) {
    capturePaymentCompleted({
      distinctId: md.renter_user_id,
      kind: "field_rental",
      amountCents: paidCents,
      brand: normalizeBrand(md.brand),
      organizationId: md.organization_id || undefined,
      metadata: { block_id: blockId, block_payment: "deposit" },
    });
  }

  return { status: "processed", blockId, paidCents };
}
