import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { stripe } from "@/lib/stripe/client";
import { upsertGuestUser } from "@/lib/registrations/upsert-guest-user";
import { isPrintfulConfigured, calculateShipping, PrintfulApiError } from "@/lib/printful/client";
import { toPrintfulRecipient, pickCheapestRate, shippingRateToCents } from "@/lib/printful/order-mappers";
import { assembleQuote } from "@/lib/merch/quote";
import { repriceCartItems } from "@/lib/merch/reprice";
import { buildMerchLineItems } from "@/lib/merch/checkout-line-items";

const schema = z.object({
  email: z.string().email(),
  address: z.object({
    name: z.string().trim().min(1), address1: z.string().min(1), address2: z.string().optional().nullable(),
    city: z.string().min(1), state: z.string().min(2), zip: z.string().min(3), country: z.string().length(2),
  }),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
});

export const POST: APIRoute = async (context) => {
  const ip = context.clientAddress ?? "unknown";
  const limit = rateLimit(`merch-checkout:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);
  if (!stripe || !isPrintfulConfigured()) return new Response(JSON.stringify({ error: "Checkout unavailable" }), { status: 503 });

  const org = context.locals.organization;
  if (!org) return new Response(JSON.stringify({ error: "No organization" }), { status: 400 });

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid", details: parsed.error.flatten() }), { status: 400 });

  // server-authoritative re-price: only active variants of active products in this org
  const db = getDb();
  const repriced = await repriceCartItems(org.id, parsed.data.items);
  if (!repriced.ok) return new Response(JSON.stringify({ error: "Some items are unavailable" }), { status: 422 });
  const priced = repriced.lines;

  // live shipping + order creation + Stripe session
  try {
    const rates = await calculateShipping(toPrintfulRecipient(parsed.data.address), priced.map((p) => ({ variant_id: p.printfulVariantId, quantity: p.quantity })));
    const cheapest = pickCheapestRate(rates);
    if (!cheapest) return new Response(JSON.stringify({ error: "We can't ship to that address" }), { status: 422, headers: { "Content-Type": "application/json" } });
    const shippingCents = shippingRateToCents(cheapest.rate);

    const quote = assembleQuote(priced.map((p) => ({ unitPriceCents: p.unitPriceCents, quantity: p.quantity })), shippingCents);

    // guest user + order (pending)
    const [firstName, ...rest] = parsed.data.address.name.trim().split(/\s+/);
    const { userRow } = await upsertGuestUser(db, { email: parsed.data.email, firstName: firstName ?? parsed.data.email, lastName: rest.join(" ") || "-" });

    const [order] = await db.insert(merchOrders).values({
      organizationId: org.id, userId: userRow.id, email: parsed.data.email, status: "pending",
      shippingAddress: parsed.data.address, subtotalCents: quote.subtotalCents, shippingCents, taxCents: 0,
      totalCents: quote.totalBeforeTaxCents, currency: "usd",
    }).returning({ id: merchOrders.id });

    await db.insert(merchOrderItems).values(priced.map((p) => ({
      orderId: order.id, merchVariantId: p.variantId, fulfillmentType: "printful_pod" as const,
      productName: p.productName, variantName: p.variantName, size: p.size, color: p.color,
      printfulSyncVariantId: p.printfulSyncVariantId, unitPriceCents: p.unitPriceCents, quantity: p.quantity,
    })));

    const a = parsed.data.address;
    const stripeAddress = {
      line1: a.address1,
      line2: a.address2 ?? undefined,
      city: a.city,
      state: a.state,
      postal_code: a.zip,
      country: a.country,
    };
    const customer = await stripe.customers.create({
      email: parsed.data.email,
      name: a.name,
      address: stripeAddress,
      shipping: { name: a.name, address: stripeAddress },
    });

    const appUrl = new URL(context.request.url).origin;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer: customer.id,
      line_items: buildMerchLineItems(priced.map((p) => ({
        productName: p.productName, variantLabel: [p.color, p.size].filter(Boolean).join(" · "),
        unitPriceCents: p.unitPriceCents, quantity: p.quantity,
      })), "usd"),
      shipping_options: [{
        shipping_rate_data: { type: "fixed_amount", display_name: "Shipping", fixed_amount: { amount: shippingCents, currency: "usd" } },
      }],
      automatic_tax: { enabled: true },
      metadata: { type: "merch_order", order_id: order.id, organization_id: org.id },
      success_url: `${appUrl}/shop/order?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/shop/checkout`,
    }, { idempotencyKey: `merch:${order.id}:session` });

    await db.update(merchOrders).set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() }).where(eq(merchOrders.id, order.id));

    return new Response(JSON.stringify({ url: session.url }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    if (e instanceof PrintfulApiError) return new Response(JSON.stringify({ error: "Shipping quote failed" }), { status: 502, headers: { "Content-Type": "application/json" } });
    console.error("merch checkout failed", e);
    return new Response(JSON.stringify({ error: "We couldn't start checkout. Please try again." }), { status: 500, headers: { "Content-Type": "application/json" } });
  }
};
