/**
 * Stripe webhook handler for a rental block's BALANCE.
 *
 * Dispatched from /api/webhooks/stripe when
 * `event.type === "checkout.session.completed"` AND
 * `metadata.type === "rental_block_balance"`.
 *
 * Paying the balance settles the block, which is the moment every session
 * finally flips to `payment_status = 'paid'` - until then the block row alone
 * carries the payment truth. All of that lives in `applyBalancePaid`.
 */
import type Stripe from "stripe";
import { applyBalancePaid } from "@/lib/rentals/blocks/lifecycle";
import { normalizeBrand } from "@/lib/organization/soccerone-routing";
import { capturePaymentCompleted } from "@/lib/observability/payment-telemetry";

export async function handleRentalBlockBalanceComplete(
  session: Stripe.Checkout.Session,
): Promise<
  | { status: "skipped"; reason: string }
  | { status: "processed"; blockId: string; paidCents: number }
> {
  const blockId = session.metadata?.block_id;
  if (!blockId) return { status: "skipped", reason: "missing block_id metadata" };

  const paymentIntentId = (session.payment_intent as string) ?? null;
  const paidCents = session.amount_total ?? 0;

  const result = await applyBalancePaid(blockId, paymentIntentId, paidCents);
  if (!result.ok) {
    return { status: "skipped", reason: result.reason ?? "balance not applied" };
  }

  const md = session.metadata ?? {};
  if (md.renter_user_id) {
    capturePaymentCompleted({
      distinctId: md.renter_user_id,
      kind: "field_rental",
      amountCents: paidCents,
      brand: normalizeBrand(md.brand),
      organizationId: md.organization_id || undefined,
      metadata: { block_id: blockId, block_payment: "balance" },
    });
  }

  return { status: "processed", blockId, paidCents };
}
