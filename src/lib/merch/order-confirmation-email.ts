import { getDb } from "@/lib/db";
import { eq } from "drizzle-orm";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

const money = (c: number) => `$${(c / 100).toFixed(2)}`;

export async function sendMerchOrderConfirmation(orderId: string): Promise<void> {
  const db = getDb();
  const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
  if (!order) return;
  const items = await db.select().from(merchOrderItems).where(eq(merchOrderItems.orderId, orderId));
  const rows = items.map((i) => `<tr><td>${i.productName} ${[i.color, i.size].filter(Boolean).join(" · ")} × ${i.quantity}</td><td align="right">${money(i.unitPriceCents * i.quantity)}</td></tr>`).join("");
  await sendEmail({
    to: order.email,
    subject: "Your Aspire Sports order is confirmed",
    html: `<h1>Thanks for your order!</h1><table>${rows}
      <tr><td>Shipping</td><td align="right">${money(order.shippingCents)}</td></tr>
      <tr><td>Tax</td><td align="right">${money(order.taxCents)}</td></tr>
      <tr><td><strong>Total</strong></td><td align="right"><strong>${money(order.totalCents)}</strong></td></tr>
      </table><p>We'll email tracking when it ships.</p>`,
  });
}
