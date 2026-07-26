import type { APIRoute } from "astro";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { isPrintfulConfigured, calculateShipping, PrintfulApiError } from "@/lib/printful/client";
import { toPrintfulRecipient, pickCheapestRate, shippingRateToCents } from "@/lib/printful/order-mappers";
import { assembleQuote } from "@/lib/merch/quote";
import { repriceStoreCartItems, type RepricedLine } from "@/lib/merch/reprice";
import { explodeBundles } from "@/lib/merch/bundle-checkout";
import { partitionByFulfillment, cartMixesLuluWithOtherPhysical } from "@/lib/merch/checkout-store";
import { getStoreById, isStoreShoppable } from "@/lib/merch/stores";
import { resolveSelfShippedRate } from "@/lib/merch/self-shipped-shipping";
import { resolveLuluShippingOptions, pickLuluOption, type LuluShippingOption } from "@/lib/merch/lulu-shipping";

const schema = z.object({
  storeId: z.string().uuid(),
  address: z.object({
    name: z.string().min(1), address1: z.string().min(1), address2: z.string().optional().nullable(),
    city: z.string().min(1), state: z.string().min(2), zip: z.string().min(3), country: z.string().length(2),
  }).optional().nullable(),
  items: z.array(z.object({
    variantId: z.string().uuid(),
    quantity: z.number().int().min(1).max(50),
    personalization: z.object({
      name: z.string().max(40).optional(),
      number: z.string().max(10).optional(),
    }).optional().nullable(),
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
  const limit = rateLimit(`merch-quote:ip:${ip}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);

  const org = context.locals.organization;
  if (!org) return json({ error: "No organization" }, 400);

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);

  const store = await getStoreById(org.id, parsed.data.storeId);
  if (!store) return json({ error: "Store not found" }, 404);
  if (!isStoreShoppable(store, new Date())) {
    return json({ error: "This store isn't accepting orders right now" }, 422);
  }

  // server-authoritative re-price: only active variants of active products in this store
  let productLines: RepricedLine[] = [];
  if (parsed.data.items.length > 0) {
    const repriced = await repriceStoreCartItems(store.id, parsed.data.items);
    if (!repriced.ok) return json({ error: "Some items are unavailable" }, 422);
    productLines = repriced.lines;
  }

  // required personalization present? (relies on repriceStoreCartItems preserving request order)
  // mirrors checkout.ts so a quote and the subsequent checkout never disagree
  for (let i = 0; i < productLines.length; i++) {
    const cfg = productLines[i].personalizationConfig;
    const val = parsed.data.items[i]?.personalization ?? null;
    if (cfg?.name && !val?.name) return json({ error: "Name required for a personalized item" }, 422);
    if (cfg?.number && !val?.number) return json({ error: "Number required for a personalized item" }, 422);
  }

  // server-authoritative bundle explosion (merch Phase 3d) — priced independently
  // of the free-standing product lines above, then concatenated before shipping/quote math.
  const exploded = await explodeBundles(store.id, parsed.data.bundles ?? []);
  if (!exploded.ok) return json({ error: exploded.error }, exploded.status);

  const priced = [...productLines, ...exploded.lines];
  if (priced.length === 0) return json({ error: "Your cart is empty" }, 400);

  if (cartMixesLuluWithOtherPhysical(priced)) {
    return json({ error: "Printed books ship separately — please order them on their own." }, 422);
  }

  const { printful, selfShipped, lulu } = partitionByFulfillment(priced);

  try {
    // sum across fulfillment types (a store could mix printful + self-shipped lines
    // in one cart) so quote and checkout always agree on total shipping cost.
    let shippingCents = 0;
    if (printful.length) {
      if (!isPrintfulConfigured()) return json({ error: "Shop unavailable" }, 503);
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
    }
    let luluShippingOptions: LuluShippingOption[] | null = null;
    let luluSelectedLevel: string | null = null;
    if (lulu.length) {
      if (!parsed.data.address) return json({ error: "Shipping address required" }, 422);
      const r = await resolveLuluShippingOptions(parsed.data.address, lulu);
      if (!r.ok) return json({ error: r.error }, r.status);
      const selected = pickLuluOption(r.options, parsed.data.luluShippingLevel);
      if (!selected) return json({ error: "That shipping option isn't available for your address" }, 422);
      luluShippingOptions = r.options;
      luluSelectedLevel = selected.level;
      shippingCents += selected.amountCents;
    }

    const quote = assembleQuote(
      priced.map((p) => ({ unitPriceCents: p.unitPriceCents, quantity: p.quantity })),
      shippingCents,
    );
    return json({
      ...quote,
      currency: "usd",
      ...(luluShippingOptions ? { luluShippingOptions, luluShippingLevel: luluSelectedLevel } : {}),
      store: {
        id: store.id,
        name: store.name,
        pickupLocation: store.pickupLocation,
        orderOpensAt: store.orderOpensAt,
        orderClosesAt: store.orderClosesAt,
      },
      items: priced.map((p) => ({
        variantId: p.variantId,
        unitPriceCents: p.unitPriceCents,
        quantity: p.quantity,
        bundleId: p.bundleId ?? null,
        bundleName: p.bundleName ?? null,
      })),
    }, 200);
  } catch (e) {
    if (e instanceof PrintfulApiError) return json({ error: "Shipping quote failed" }, 502);
    console.error("merch quote failed", e);
    return json({ error: "Quote failed" }, 500);
  }
};
