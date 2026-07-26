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
import { repriceStoreCartItems, type RepricedLine } from "@/lib/merch/reprice";
import { explodeBundles } from "@/lib/merch/bundle-checkout";
import { buildMerchLineItems, DIGITAL_TAX_CODE, MERCH_TAX_CODE } from "@/lib/merch/checkout-line-items";
import { partitionByFulfillment, cartNeedsAddress, cartMixesLuluWithOtherPhysical } from "@/lib/merch/checkout-store";
import { getStoreById, isStoreShoppable } from "@/lib/merch/stores";
import { getOrgOriginAddress } from "@/lib/merch/org-origin";
import { resolveSelfShippedRate } from "@/lib/merch/self-shipped-shipping";
import { resolveLuluShippingOptions, pickLuluOption } from "@/lib/merch/lulu-shipping";

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
  })).max(50).default([]),
  bundles: z.array(z.object({
    bundleId: z.string().uuid(),
    selections: z.array(z.object({
      slotId: z.string().uuid(),
      variantId: z.string().uuid(),
    })).min(1).max(20),
    quantity: z.number().int().min(1).max(50),
  })).max(20).optional(),
  luluShippingLevel: z.enum(["MAIL", "PRIORITY_MAIL", "GROUND", "EXPEDITED", "EXPRESS"]).optional().nullable(),
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
  let productLines: RepricedLine[] = [];
  if (parsed.data.items.length > 0) {
    const repriced = await repriceStoreCartItems(store.id, parsed.data.items);
    if (!repriced.ok) return json({ error: "Some items are unavailable" }, 422);
    productLines = repriced.lines;
  }

  // required personalization present? (relies on repriceStoreCartItems preserving request order)
  for (let i = 0; i < productLines.length; i++) {
    const cfg = productLines[i].personalizationConfig;
    const val = parsed.data.items[i]?.personalization ?? null;
    if (cfg?.name && !val?.name) return json({ error: "Name required for a personalized item" }, 422);
    if (cfg?.number && !val?.number) return json({ error: "Number required for a personalized item" }, 422);
  }

  // server-authoritative bundle explosion (merch Phase 3d) — concatenated with the
  // free-standing product lines before shipping/Stripe/order-item persistence.
  const exploded = await explodeBundles(store.id, parsed.data.bundles ?? []);
  if (!exploded.ok) return json({ error: exploded.error }, exploded.status);

  // per-line personalization, aligned 1:1 with `priced` below: product lines carry
  // whatever the client sent for that index, bundle lines never take personalization.
  const personalizationByLine: (typeof parsed.data.items[number]["personalization"])[] = [
    ...parsed.data.items.map((it) => it.personalization ?? null),
    ...exploded.lines.map(() => null),
  ];

  const priced = [...productLines, ...exploded.lines];
  if (priced.length === 0) return json({ error: "Your cart is empty" }, 400);

  if (cartMixesLuluWithOtherPhysical(priced)) {
    return json({ error: "Printed books ship separately — please order them on their own." }, 422);
  }

  const { printful, selfShipped, lulu } = partitionByFulfillment(priced);
  const needsShipping = cartNeedsAddress(priced);

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
      shipCarrier = r.carrier?.slice(0, 60) ?? null;
      shipService = r.service?.slice(0, 120) ?? null;
    }
    let luluLevel: string | null = null;
    if (lulu.length) {
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const r = await resolveLuluShippingOptions(parsed.data.address, lulu);
      if (!r.ok) return json({ error: r.error }, r.status);
      const selected = pickLuluOption(r.options, parsed.data.luluShippingLevel);
      if (!selected) return json({ error: "That shipping option isn't available for your address" }, 422);
      luluLevel = selected.level;
      shippingCents += selected.amountCents;
      shipService = selected.label;
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
      luluShippingLevel: luluLevel,
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
      personalization: personalizationByLine[i] ?? null,
      unitPriceCents: p.unitPriceCents,
      quantity: p.quantity,
      bundleId: p.bundleId ?? null,
      bundleName: p.bundleName ?? null,
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
        taxCode: p.fulfillmentType === "digital" ? DIGITAL_TAX_CODE : MERCH_TAX_CODE,
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
