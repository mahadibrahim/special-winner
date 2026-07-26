import { getDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { merchOrders, merchOrderItems, merchVariants, merchProducts, merchDownloadGrants } from "@/lib/db/schema";
import { createOrder } from "@/lib/printful/client";
import { toPrintfulRecipient, buildPrintfulOrderItems, toPrintfulExternalId } from "@/lib/printful/order-mappers";
import { sendMerchOrderConfirmation, sendMerchPickupConfirmation, sendMerchDigitalDelivery } from "./order-confirmation-email";
import { generateDownloadToken, grantExpiryFrom } from "./digital-delivery";
import { submitLuluOrder } from "./lulu-fulfillment";

export class UnsupportedFulfillmentError extends Error {
  constructor(type: string) { super(`Unsupported fulfillment type: ${type}`); this.name = "UnsupportedFulfillmentError"; }
}

/** Phase 2 fulfills printful_pod; Phase 3 adds pickup (handled entirely
 * in-house — no Printful order is ever created for it), self_shipped
 * (handled entirely in-house by the org — no Printful order, no automatic
 * carrier submission; the admin ships it manually and marks it shipped),
 * and digital (handled entirely in-house via download grants — no Printful
 * order, see handleMerchOrderCompleted). Any other type is a future line
 * that must not have reached checkout yet — fail loudly rather than
 * silently drop. */
export function assertSupportedFulfillment(types: string[]): void {
  for (const t of types) if (t !== "printful_pod" && t !== "pickup" && t !== "self_shipped" && t !== "digital" && t !== "lulu_pod") throw new UnsupportedFulfillmentError(t);
}

/** True if any line in the order is digital-fulfilled. */
export function orderHasDigital(items: { fulfillmentType: string }[]): boolean {
  return items.some((i) => i.fulfillmentType === "digital");
}

/** True if the order is non-empty AND every line is digital-fulfilled. */
export function orderIsAllDigital(items: { fulfillmentType: string }[]): boolean {
  return items.length > 0 && items.every((i) => i.fulfillmentType === "digital");
}

/** Pure dispatch for the PHYSICAL lines of an order: an order is a "pickup"
 * order only if every physical line is pickup-fulfilled, and a "self_shipped"
 * order only if every physical line is self_shipped. Mixed or all-printful
 * orders go through the existing Printful path (the catch-all for any
 * shippable/mixed order — its path only submits printful lines).
 *
 * Digital lines are delivered orthogonally (download grants) and are excluded
 * here, so a mixed digital+pickup order still resolves to "pickup" (not the
 * printful fallback) and gets its pickup status + email. An all-digital order
 * is handled + returned before this is called; if it somehow reaches here the
 * empty-physical set defaults to "printful" (pre-existing empty behavior —
 * fulfillMerchOrder already throws on empty items). */
export function orderFulfillmentPlan(items: { fulfillmentType: string }[]): "pickup" | "self_shipped" | "printful" | "lulu" {
  const physical = items.filter((i) => i.fulfillmentType !== "digital");
  if (physical.length === 0) return "printful";
  if (physical.every((i) => i.fulfillmentType === "pickup")) return "pickup";
  if (physical.every((i) => i.fulfillmentType === "self_shipped")) return "self_shipped";
  if (physical.every((i) => i.fulfillmentType === "lulu_pod")) return "lulu";
  return "printful";
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

  // No Printful-fulfilled lines (e.g. a pickup + self_shipped mix routed here by
  // the catch-all plan) — nothing to submit. Leave the order 'paid'; pickup and
  // self_shipped lines are handled by their own flows / admin. Mixed-fulfillment
  // orders are a documented 3c simplification (spec non-goals).
  if (printfulItems.length === 0) {
    return { printfulOrderId: "" };
  }

  const result = await createOrder({
    recipient: toPrintfulRecipient(order.shippingAddress),
    items: buildPrintfulOrderItems(printfulItems.map((i) => ({ printfulSyncVariantId: i.printfulSyncVariantId, quantity: i.quantity }))),
    external_id: toPrintfulExternalId(order.id),
  }, { confirm: true });

  const printfulOrderId = String(result.id);
  await db.update(merchOrders).set({ printfulOrderId, status: "submitted", updatedAt: new Date() }).where(eq(merchOrders.id, orderId));
  return { printfulOrderId };
}

/** Create a download grant for each digital order-item that doesn't already
 * have one. Idempotent per order-item (belt-and-suspenders — the caller's
 * top-level `status !== "pending"` guard already prevents a re-fired
 * webhook from reaching this at all). Skips an item whose product has no
 * digitalAssetKey configured — that shouldn't happen if the admin validated
 * the product, but must not throw and abort the rest of fulfillment. */
async function grantDigitalDownloads(db: ReturnType<typeof getDb>, orderId: string): Promise<void> {
  const digitalItems = await db
    .select({
      id: merchOrderItems.id,
      digitalAssetKey: merchProducts.digitalAssetKey,
      digitalAssetName: merchProducts.digitalAssetName,
    })
    .from(merchOrderItems)
    .innerJoin(merchVariants, eq(merchOrderItems.merchVariantId, merchVariants.id))
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(and(eq(merchOrderItems.orderId, orderId), eq(merchOrderItems.fulfillmentType, "digital")));

  for (const item of digitalItems) {
    if (!item.digitalAssetKey || !item.digitalAssetName) {
      console.warn(`[merch] digital order item ${item.id} (order ${orderId}) has no digital asset configured — skipping grant`);
      continue;
    }
    const [existing] = await db.select({ id: merchDownloadGrants.id })
      .from(merchDownloadGrants).where(eq(merchDownloadGrants.orderItemId, item.id)).limit(1);
    if (existing) continue; // idempotent: grant already issued for this line

    await db.insert(merchDownloadGrants).values({
      orderItemId: item.id,
      token: generateDownloadToken(),
      assetKey: item.digitalAssetKey,
      assetName: item.digitalAssetName,
      expiresAt: grantExpiryFrom(new Date()),
      downloadCount: 0,
    });
  }
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

  // 1) mark paid (record Stripe-computed tax + total) — an atomic conditional
  // update, not select-then-update: Stripe can (and does) deliver
  // checkout.session.completed more than once for the same session, and a
  // bare read-then-write here would let two concurrent deliveries both pass
  // the `status !== "pending"` check above and both go on to submit a print
  // job (Lulu or Printful). The WHERE clause re-checks status="pending" at
  // write time, so only one concurrent delivery can win the transition; the
  // loser bails out below instead of double-submitting.
  const [claimed] = await db.update(merchOrders).set({
    status: "paid",
    stripePaymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : order.stripePaymentIntentId,
    taxCents: session.total_details?.amount_tax ?? 0,
    totalCents: session.amount_total ?? order.totalCents,
    updatedAt: new Date(),
  }).where(and(eq(merchOrders.id, orderId), eq(merchOrders.status, "pending")))
    .returning({ id: merchOrders.id });
  if (!claimed) return { status: "already-processed" };

  const itemsForPlan = await db.select({ fulfillmentType: merchOrderItems.fulfillmentType })
    .from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));

  // 2) digital fulfillment: generate download grants + send the delivery
  // email BEFORE the physical dispatch below, so a mixed digital+physical
  // order gets both (grants/email here, then the physical plan runs and
  // sets the physical status). An all-digital order is fully handled here
  // and returns early — it never touches the pickup/self_shipped/printful path.
  if (orderHasDigital(itemsForPlan)) {
    await grantDigitalDownloads(db, orderId);
    try { await sendMerchDigitalDelivery(orderId); } catch (e) { console.error(`[merch] digital delivery email failed for ${orderId}:`, e); }

    if (orderIsAllDigital(itemsForPlan)) {
      await db.update(merchOrders).set({ status: "delivered", updatedAt: new Date() }).where(eq(merchOrders.id, orderId));
      return { status: "processed-digital" };
    }
  }

  // 3) dispatch on fulfillment plan for the remaining (physical) lines — a
  // pickup order never touches Printful
  const plan = orderFulfillmentPlan(itemsForPlan);

  if (plan === "pickup") {
    await db.update(merchOrders).set({ status: "awaiting_pickup", updatedAt: new Date() }).where(eq(merchOrders.id, orderId));
    try { await sendMerchPickupConfirmation(orderId); } catch (e) { console.error(`[merch] pickup email failed for ${orderId}:`, e); }
    return { status: "processed-pickup" };
  }

  // self_shipped: no external fulfillment call — the order stays 'paid' and
  // the org ships it manually later (see admin mark-shipped in Slice 4).
  if (plan === "self_shipped") {
    try { await sendMerchOrderConfirmation(orderId); } catch (e) { console.error(`[merch] confirmation email failed for ${orderId}:`, e); }
    return { status: "processed-self-shipped" };
  }

  // lulu: submit the print job. Money-safe like the printful path — a failure
  // (Lulu down, PDF rejected) leaves the order 'paid' for admin retry; the
  // payment is captured and the order recorded either way.
  if (plan === "lulu") {
    try {
      await submitLuluOrder(orderId);
    } catch (e) {
      console.error(`[merch] lulu submission failed for paid order ${orderId} — left 'paid' for retry:`, e);
    }
    try { await sendMerchOrderConfirmation(orderId); } catch (e) { console.error(`[merch] confirmation email failed for ${orderId}:`, e); }
    return { status: "processed-lulu" };
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
