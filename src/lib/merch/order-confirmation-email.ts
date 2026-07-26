import { getDb } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { merchOrders, merchOrderItems, merchStores, merchDownloadGrants } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

function renderItemRows(items: { productName: string; color: string | null; size: string | null; unitPriceCents: number; quantity: number }[]): string {
  return items.map((i) => `<tr><td>${i.productName} ${[i.color, i.size].filter(Boolean).join(" · ")} × ${i.quantity}</td><td align="right">${money(i.unitPriceCents * i.quantity)}</td></tr>`).join("");
}

export async function sendMerchOrderConfirmation(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const rows = renderItemRows(items);
  const result = await sendEmail({
    to: order.email,
    subject: "Your Aspire Sports order is confirmed",
    html: `<h1>Thanks for your order!</h1><table>${rows}
      <tr><td>Shipping</td><td align="right">${money(order.shippingCents)}</td></tr>
      <tr><td>Tax</td><td align="right">${money(order.taxCents)}</td></tr>
      <tr><td><strong>Total</strong></td><td align="right"><strong>${money(order.totalCents)}</strong></td></tr>
      </table><p>We'll email tracking when it ships.</p>`,
  });
  if (!result.success) console.error(`[merch] confirmation email not sent for ${orderId}:`, result.error);
}

/** Pickup orders never ship — no tracking copy, no shipping line. Instead
 * this surfaces the store's pickup location + order-closes window and tells
 * the buyer we'll notify them when it's ready to collect. */
export async function sendMerchPickupConfirmation(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;
  const [store] = await db.select().from(merchStores).where(eq(merchStores.id, order.storeId)).limit(1);
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const rows = items.map((i) => {
    const pers = i.personalization
      ? ` — ${[i.personalization.name, i.personalization.number].filter(Boolean).join(" #")}`
      : "";
    return `<tr><td>${i.productName} ${[i.color, i.size].filter(Boolean).join(" · ")}${pers} × ${i.quantity}</td><td align="right">${money(i.unitPriceCents * i.quantity)}</td></tr>`;
  }).join("");
  const where = store?.pickupLocation ? `<p><strong>Pickup location:</strong> ${store.pickupLocation}</p>` : "";
  const when = store?.orderClosesAt ? `<p>Pickup after ordering closes on ${store.orderClosesAt.toLocaleDateString()}.</p>` : "";
  const result = await sendEmail({
    to: order.email,
    subject: "Your Aspire Sports order is confirmed (pickup)",
    html: `<h1>Thanks for your order!</h1><table>${rows}
      <tr><td>Tax</td><td align="right">${money(order.taxCents)}</td></tr>
      <tr><td><strong>Total</strong></td><td align="right"><strong>${money(order.totalCents)}</strong></td></tr>
      </table>${where}${when}<p>We'll let you know when it's ready to collect.</p>`,
  });
  if (!result.success) console.error(`[merch] pickup email not sent for ${orderId}:`, result.error);
}

/** Pure body builder for the shipped/tracking email — this IS the tracking
 * notification (unlike the order confirmation, which only promises tracking
 * later), so it always shows the carrier/service + tracking number, linked
 * to the carrier tracking page when a URL is available. */
export function buildShippedEmailHtml(args: {
  productRows: string;
  carrier?: string | null;
  service?: string | null;
  trackingNumber: string;
  trackingUrl?: string | null;
}): string {
  const { productRows, carrier, service, trackingNumber, trackingUrl } = args;
  const carrierService = [carrier, service].filter(Boolean).join(" · ");
  const trackingLine = trackingUrl
    ? `<a href="${trackingUrl}">${trackingNumber}</a>`
    : trackingNumber;
  return `<h1>Your order has shipped!</h1>
      ${carrierService ? `<p><strong>Carrier:</strong> ${carrierService}</p>` : ""}
      <p><strong>Tracking number:</strong> ${trackingLine}</p>
      <table>${productRows}</table>`;
}

/** Sent when an admin marks a self_shipped (or otherwise manually-fulfilled)
 * order as shipped with carrier + tracking info. This is the one email that
 * actually carries tracking — the order confirmation only promises it. */
export async function sendMerchShippedEmail(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;
  if (!order.trackingNumber) {
    console.error(`[merch] shipped email skipped for ${orderId}: no tracking number recorded`);
    return;
  }
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const productRows = renderItemRows(items);
  const html = buildShippedEmailHtml({
    productRows,
    carrier: order.shippingCarrier,
    service: order.shippingService,
    trackingNumber: order.trackingNumber,
    trackingUrl: order.trackingUrl,
  });
  const result = await sendEmail({
    to: order.email,
    subject: "Your Aspire Sports order has shipped",
    html,
  });
  if (!result.success) console.error(`[merch] shipped email not sent for ${orderId}:`, result.error);
}

/** Pure body builder for the digital delivery email — one download link per
 * digital item. The link is the grant token URL; it's the same URL the
 * buyer can revisit later from the order page. */
export function buildDigitalDeliveryHtml(args: { items: { name: string; url: string }[] }): string {
  const rows = args.items
    .map((i) => `<li>${i.name} — <a href="${i.url}">Download</a></li>`)
    .join("");
  return `<h1>Your download is ready!</h1>
      <ul>${rows}</ul>
      <p>Each download link is valid for 6 months from purchase.</p>`;
}

/** Sent when a paid order contains at least one digital line. Lists a
 * download link per digital order-item's grant (one grant per item, created
 * by handleMerchOrderCompleted before this is called). Guarded by the
 * caller — a failure here must not block fulfillment of any physical lines
 * in a mixed order. */
export async function sendMerchDigitalDelivery(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;

  const rows = await db
    .select({
      productName: merchOrderItems.productName,
      token: merchDownloadGrants.token,
    })
    .from(merchOrderItems)
    .innerJoin(merchDownloadGrants, eq(merchDownloadGrants.orderItemId, merchOrderItems.id))
    .where(and(eq(merchOrderItems.orderId, orderId), eq(merchOrderItems.fulfillmentType, "digital")));

  if (rows.length === 0) return; // no grants yet — nothing to deliver

  const appUrl = import.meta.env.PUBLIC_APP_URL ?? "http://localhost:4321";
  const html = buildDigitalDeliveryHtml({
    items: rows.map((r) => ({ name: r.productName, url: `${appUrl}/shop/download/${r.token}` })),
  });
  const result = await sendEmail({
    to: order.email,
    subject: "Your Aspire Sports download is ready",
    html,
  });
  if (!result.success) console.error(`[merch] digital delivery email not sent for ${orderId}:`, result.error);
}
