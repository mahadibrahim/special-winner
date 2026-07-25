import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { createOrder } from "@/lib/printful/client";
import { toPrintfulRecipient, buildPrintfulOrderItems } from "@/lib/printful/order-mappers";
import { sendMerchOrderConfirmation } from "./order-confirmation-email";

export class UnsupportedFulfillmentError extends Error {
  constructor(type: string) { super(`Unsupported fulfillment type: ${type}`); this.name = "UnsupportedFulfillmentError"; }
}

/** Phase 2 only fulfills printful_pod. Any other type is a Phase-3 line that
 * must not have reached checkout yet — fail loudly rather than silently drop. */
export function assertSupportedFulfillment(types: string[]): void {
  for (const t of types) if (t !== "printful_pod") throw new UnsupportedFulfillmentError(t);
}

export async function fulfillMerchOrder(orderId: string): Promise<{ printfulOrderId: string }> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) throw new Error(`merch order not found: ${orderId}`);

  // Idempotency guard: never re-submit an order that already reached Printful.
  // (Protects a future admin "retry fulfillment" caller from creating a duplicate
  // physical order.)
  if (order.printfulOrderId || order.status === "submitted" || order.status === "shipped") {
    return { printfulOrderId: order.printfulOrderId ?? "" };
  }

  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  if (items.length === 0) throw new Error(`merch order ${orderId} has no items to fulfill`);
  assertSupportedFulfillment(items.map((i) => i.fulfillmentType));

  const result = await createOrder({
    recipient: toPrintfulRecipient(order.shippingAddress),
    items: buildPrintfulOrderItems(items.map((i) => ({ printfulSyncVariantId: i.printfulSyncVariantId, quantity: i.quantity }))),
    external_id: order.id,
  }, { confirm: true });

  const printfulOrderId = String(result.id);
  await db.update(merchOrders).set({ printfulOrderId, status: "submitted", updatedAt: new Date() }).where(eq(merchOrders.id, orderId));
  return { printfulOrderId };
}

/** Called from the Stripe webhook on checkout.session.completed / merch_order. */
export async function handleMerchOrderCompleted(session: {
  id: string; metadata?: Record<string, string> | null;
  payment_intent?: string | null; amount_total?: number | null;
  total_details?: { amount_tax?: number | null } | null;
}): Promise<{ status: string }> {
  const db = getDb();
  const orderId = session.metadata?.order_id;
  if (!orderId) return { status: "no-order-id" };

  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return { status: "order-not-found" };
  if (order.status !== "pending") return { status: `already-${order.status}` }; // idempotent

  // 1) mark paid (record Stripe-computed tax + total)
  await db.update(merchOrders).set({
    status: "paid",
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : order.stripePaymentIntentId,
    taxCents: session.total_details?.amount_tax ?? 0,
    totalCents: session.amount_total ?? order.totalCents,
    updatedAt: new Date(),
  }).where(eq(merchOrders.id, orderId));

  // 2) fulfill — money-safe: a failure leaves the order 'paid' for retry, never lost
  try {
    await fulfillMerchOrder(orderId);
  } catch (e) {
    console.error(`[merch] fulfillment failed for paid order ${orderId} — left 'paid' for retry:`, e);
    // intentionally do not rethrow: payment is captured; the order is recorded.
  }

  // 3) confirmation email (sendEmail respects the messaging mock/gate)
  try { await sendMerchOrderConfirmation(orderId); } catch (e) { console.error(`[merch] confirmation email failed for ${orderId}:`, e); }

  return { status: "processed" };
}
