import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { merchOrders, merchOrderItems, merchStores } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function sendMerchOrderConfirmation(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const rows = items.map((i) => `<tr><td>${i.productName} ${[i.color, i.size].filter(Boolean).join(" · ")} × ${i.quantity}</td><td align="right">${money(i.unitPriceCents * i.quantity)}</td></tr>`).join("");
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
