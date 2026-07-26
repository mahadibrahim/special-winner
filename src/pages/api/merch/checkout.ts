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
import { repriceStoreCartItems } from "@/lib/merch/reprice";
import { buildMerchLineItems } from "@/lib/merch/checkout-line-items";
import { partitionByFulfillment, lineNeedsShipping } from "@/lib/merch/checkout-store";
import { getStoreById, isStoreShoppable } from "@/lib/merch/stores";
import { getOrgOriginAddress } from "@/lib/merch/org-origin";
import { resolveSelfShippedRate } from "@/lib/merch/self-shipped-shipping";

const addressSchema = z.object({
  name: z.string().trim().min(1),
  address1: z.string().min(1),
  address2: z.string().optional().nullable(),
  city: z.string().min(1),
  state: z.string().min(2),
  zip: z.string().min(3),
  country: z.string().length(2),
});

const personalizationSchema = z.object({
  name: z.string().max(40).optional(),
  number: z.string().max(10).optional(),
}).optional().nullable();

const schema = z.object({
  storeId: z.string().uuid(),
  email: z.string().email(),
  name: z.string().trim().min(1).max(120).optional(),
  address: addressSchema.optional().nullable(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
    personalization: personalizationSchema,
  })).min(1),
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

export const POST: APIRoute = async (context) => {
  const ip = context.clientAddress ?? "unknown";
  const limit = rateLimit(`merch-checkout:ip:${ip}`, 10, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);
  if (!stripe) return json({ error: "Checkout unavailable" }, 503);

  const org = context.locals.organization;
  if (!org) return json({ error: "No organization" }, 400);

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);

  const store = await getStoreById(org.id, parsed.data.storeId);
  if (!store) return json({ error: "Store not found" }, 404);
  if (!isStoreShoppable(store, new Date())) {
    return json({ error: "This store isn't accepting orders right now" }, 422);
  }

  const db = getDb();
  const repriced = await repriceStoreCartItems(store.id, parsed.data.items);
  if (!repriced.ok) return json({ error: "Some items are unavailable" }, 422);
  const priced = repriced.lines;
  const { printful, selfShipped } = partitionByFulfillment(priced);
  const needsShipping = priced.some(lineNeedsShipping);

  // required personalization present? (relies on repriceStoreCartItems preserving request order)
  for (let i = 0; i < priced.length; i++) {
    const cfg = priced[i].personalizationConfig;
    const val = parsed.data.items[i]?.personalization ?? null;
    if (cfg?.name && !val?.name) return json({ error: "Name required for a personalized item" }, 422);
    if (cfg?.number && !val?.number) return json({ error: "Number required for a personalized item" }, 422);
  }

  try {
    // ---- shipping (printful/self-shipped lines only; a store could in theory mix
    // both fulfillment types in one order, so sum into a running accumulator rather
    // than assigning — never let one branch clobber the other's shipping cost) ----
    let shippingCents = 0;
    let shipCarrier: string | null = null;
    let shipService: string | null = null;
    if (printful.length) {
      if (!isPrintfulConfigured()) return json({ error: "Shipping unavailable" }, 503);
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const rates = await calculateShipping(
        toPrintfulRecipient(parsed.data.address),
        printful
          .filter((p) => p.printfulVariantId !== null)
          .map((p) => ({ variant_id: p.printfulVariantId as number, quantity: p.quantity })),
      );
      const cheapest = pickCheapestRate(rates);
      if (!cheapest) return json({ error: "We can't ship to that address" }, 422);
      shippingCents += shippingRateToCents(cheapest.rate);
    }
    if (selfShipped.length) {
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const r = await resolveSelfShippedRate(org.id, parsed.data.address, selfShipped);
      if (!r.ok) return json({ error: r.error }, r.status);
      shippingCents += r.shippingCents;
      shipCarrier = r.carrier;
      shipService = r.service;
    }

    const quote = assembleQuote(
      priced.map((p) => ({ unitPriceCents: p.unitPriceCents, quantity: p.quantity })),
      shippingCents,
    );

    // guest user
    const nameForUser = parsed.data.name ?? parsed.data.address?.name ?? parsed.data.email;
    const [firstName, ...rest] = nameForUser.trim().split(/\s+/);
    const { userRow } = await upsertGuestUser(db, {
      email: parsed.data.email,
      firstName: firstName ?? parsed.data.email,
      lastName: rest.join(" ") || "-",
    });

    // order (pending). shippingAddress: real address if shipping, else the store pickup marker.
    const shippingAddress = parsed.data.address ?? {
      name: nameForUser,
      address1: store.pickupLocation ?? "Pickup",
      city: "-",
      state: "-",
      zip: "-",
      country: "US",
    };
    const [order] = await db.insert(merchOrders).values({
      organizationId: org.id,
      storeId: store.id,
      userId: userRow.id,
      email: parsed.data.email,
      status: "pending",
      shippingAddress,
      subtotalCents: quote.subtotalCents,
      shippingCents,
      taxCents: 0,
      totalCents: quote.totalBeforeTaxCents,
      currency: "usd",
      shippingCarrier: shipCarrier,
      shippingService: shipService,
    }).returning({ id: merchOrders.id });

    await db.insert(merchOrderItems).values(priced.map((p, i) => ({
      orderId: order.id,
      merchVariantId: p.variantId,
      fulfillmentType: p.fulfillmentType,
      productName: p.productName,
      variantName: p.variantName,
      size: p.size,
      color: p.color,
      printfulSyncVariantId: p.printfulSyncVariantId,
      personalization: parsed.data.items[i]?.personalization ?? null,
      unitPriceCents: p.unitPriceCents,
      quantity: p.quantity,
    })));

    // Stripe customer — address drives Stripe Tax. Shipping order: buyer address.
    // Pickup order: org origin (Ohio) so tax computes at the pickup jurisdiction.
    const taxAddr = parsed.data.address
      ? {
          line1: parsed.data.address.address1,
          line2: parsed.data.address.address2 ?? undefined,
          city: parsed.data.address.city,
          state: parsed.data.address.state,
          postal_code: parsed.data.address.zip,
          country: parsed.data.address.country,
        }
      : await getOrgOriginAddress(org.id);
    const customer = await stripe.customers.create({
      email: parsed.data.email,
      name: nameForUser,
      address: taxAddr,
      ...(parsed.data.address ? { shipping: { name: nameForUser, address: taxAddr } } : {}),
    });

    const appUrl = new URL(context.request.url).origin;
    const backPath = `/shop/${store.slug}${store.visibility === "unlisted" ? `?k=${store.shareToken}` : ""}`;
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card"],
      customer: customer.id,
      line_items: buildMerchLineItems(priced.map((p) => ({
        productName: p.productName,
        variantLabel: [p.color, p.size].filter(Boolean).join(" · "),
        unitPriceCents: p.unitPriceCents,
        quantity: p.quantity,
      })), "usd"),
      ...(needsShipping
        ? {
            shipping_options: [{
              shipping_rate_data: {
                type: "fixed_amount" as const,
                display_name: "Shipping",
                fixed_amount: { amount: shippingCents, currency: "usd" },
              },
            }],
          }
        : {}),
      automatic_tax: { enabled: true },
      metadata: { type: "merch_order", order_id: order.id, organization_id: org.id },
      success_url: `${appUrl}/shop/order?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}${backPath}`,
    }, { idempotencyKey: `merch:${order.id}:session` });

    await db.update(merchOrders)
      .set({ stripeCheckoutSessionId: session.id, updatedAt: new Date() })
      .where(eq(merchOrders.id, order.id));

    return json({ url: session.url }, 200);
  } catch (e) {
    if (e instanceof PrintfulApiError) return json({ error: "Shipping quote failed" }, 502);
    console.error("merch checkout failed", e);
    return json({ error: "We couldn't start checkout. Please try again." }, 500);
  }
};
