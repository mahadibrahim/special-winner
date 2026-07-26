import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { createOrder } from "@/lib/printful/client";
import { toPrintfulRecipient, buildPrintfulOrderItems, toPrintfulExternalId } from "@/lib/printful/order-mappers";
import { sendMerchOrderConfirmation, sendMerchPickupConfirmation } from "./order-confirmation-email";

export class UnsupportedFulfillmentError extends Error {
  constructor(type: string) { super(`Unsupported fulfillment type: ${type}`); this.name = "UnsupportedFulfillmentError"; }
}

/** Phase 2 fulfills printful_pod; Phase 3 adds pickup (handled entirely
 * in-house — no Printful order is ever created for it). Any other type
 * (self_shipped, digital) is a future line that must not have reached
 * checkout yet — fail loudly rather than silently drop. */
export function assertSupportedFulfillment(types: string[]): void {
  for (const t of types) if (t !== "printful_pod" && t !== "pickup") throw new UnsupportedFulfillmentError(t);
}

/** Pure dispatch: an order is a "pickup" order only if every line in it is
 * pickup-fulfilled. Mixed or all-printful orders go through the existing
 * Printful path. Empty items defaults to "printful" (the pre-existing
 * behavior — fulfillMerchOrder already throws on empty items). */
export function orderFulfillmentPlan(items: { fulfillmentType: string }[]): "pickup" | "printful" {
  return items.length > 0 && items.every((i) => i.fulfillmentType === "pickup") ? "pickup" : "printful";
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

  // A mixed order (some printful_pod, some pickup) only submits the
  // printful-fulfilled lines to Printful — pickup lines never have a
  // printfulSyncVariantId and are handled entirely in-house.
  const printfulItems = items.filter(
    (i): i is typeof i & { printfulSyncVariantId: string } => i.printfulSyncVariantId !== null,
  );

  const result = await createOrder({
    recipient: toPrintfulRecipient(order.shippingAddress),
    items: buildPrintfulOrderItems(printfulItems.map((i) => ({ printfulSyncVariantId: i.printfulSyncVariantId, quantity: i.quantity }))),
    external_id: toPrintfulExternalId(order.id),
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

  // 2) dispatch on fulfillment plan — a pickup order never touches Printful
  const itemsForPlan = await db.select({ fulfillmentType: merchOrderItems.fulfillmentType })
    .from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const plan = orderFulfillmentPlan(itemsForPlan);

  if (plan === "pickup") {
    await db.update(merchOrders).set({ status: "awaiting_pickup", updatedAt: new Date() }).where(eq(merchOrders.id, orderId));
    try { await sendMerchPickupConfirmation(orderId); } catch (e) { console.error(`[merch] pickup email failed for ${orderId}:`, e); }
    return { status: "processed-pickup" };
  }

  // printful path — money-safe: a failure leaves the order 'paid' for retry, never lost
  try {
    await fulfillMerchOrder(orderId);
  } catch (e) {
    console.error(`[merch] fulfillment failed for paid order ${orderId} — left 'paid' for retry:`, e);
    // intentionally do not rethrow: payment is captured; the order is recorded.
  }

  // confirmation email (sendEmail respects the messaging mock/gate)
  try { await sendMerchOrderConfirmation(orderId); } catch (e) { console.error(`[merch] confirmation email failed for ${orderId}:`, e); }

  return { status: "processed" };
}
