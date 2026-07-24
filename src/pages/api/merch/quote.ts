import type { APIRoute } from "astro";
import { z } from "zod";
import { rateLimit, rateLimitedResponse } from "@/lib/auth/rate-limit";
import { isPrintfulConfigured, calculateShipping, PrintfulApiError } from "@/lib/printful/client";
import { toPrintfulRecipient, pickCheapestRate, shippingRateToCents } from "@/lib/printful/order-mappers";
import { assembleQuote } from "@/lib/merch/quote";
import { repriceCartItems } from "@/lib/merch/reprice";

const schema = z.object({
  address: z.object({
    name: z.string().min(1), address1: z.string().min(1), address2: z.string().optional().nullable(),
    city: z.string().min(1), state: z.string().min(2), zip: z.string().min(3), country: z.string().length(2),
  }),
  items: z.array(z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(50) })).min(1),
});

export const POST: APIRoute = async (context) => {
  const ip = context.clientAddress ?? "unknown";
  const limit = rateLimit(`merch-quote:ip:${ip}`, 20, 60_000);
  if (!limit.allowed) return rateLimitedResponse(limit.retryAfter ?? 60);
  if (!isPrintfulConfigured()) return new Response(JSON.stringify({ error: "Shop unavailable" }), { status: 503 });

  const org = context.locals.organization;
  if (!org) return new Response(JSON.stringify({ error: "No organization" }), { status: 400 });

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid", details: parsed.error.flatten() }), { status: 400 });

  // server-authoritative re-price: only active variants of active products in this org
  const repriced = await repriceCartItems(org.id, parsed.data.items);
  if (!repriced.ok) return new Response(JSON.stringify({ error: "Some items are unavailable" }), { status: 422 });
  const priced = repriced.lines;

  try {
    const rates = await calculateShipping(
      toPrintfulRecipient(parsed.data.address),
      priced.map((p) => ({ variant_id: p.printfulVariantId, quantity: p.quantity })),
    );
    const cheapest = pickCheapestRate(rates);
    if (!cheapest) return new Response(JSON.stringify({ error: "We can't ship to that address" }), { status: 422 });
    const shippingCents = shippingRateToCents(cheapest.rate);
    const quote = assembleQuote(priced.map((p) => ({ unitPriceCents: p.unitPriceCents, quantity: p.quantity })), shippingCents);
    return new Response(JSON.stringify({
      ...quote, currency: "usd",
      items: priced.map((p) => ({ variantId: p.variantId, unitPriceCents: p.unitPriceCents, quantity: p.quantity })),
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  } catch (e) {
    if (e instanceof PrintfulApiError) return new Response(JSON.stringify({ error: "Shipping quote failed" }), { status: 502 });
    console.error("merch quote failed", e);
    return new Response(JSON.stringify({ error: "Quote failed" }), { status: 500 });
  }
};
