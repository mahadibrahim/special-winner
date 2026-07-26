import type { APIRoute } from "astro";
import { z } from "zod";
import { requireOrgAdminAccess } from "@/lib/auth";
import { podPackageIdForFormat } from "@/lib/lulu/formats";
import { calculatePrintJobCost, isLuluConfigured, LuluApiError } from "@/lib/lulu/client";

export const prerender = false;

const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });

const schema = z.object({
  luluFormat: z.enum(["6x9_bw", "6x9_color"]),
  pageCount: z.number().int().min(2).max(800),
  quantity: z.number().int().min(1).max(100).default(1),
});

/** Fixed US reference address — the preview informs retail pricing, it is
 * never charged to anyone. */
const REFERENCE_ADDRESS = {
  name: "Cost Preview", street1: "100 E Broad St", city: "Columbus",
  stateCode: "OH", postcode: "43215", countryCode: "US",
};

/**
 * POST /api/admin/merch/lulu-cost-preview
 *
 * Lets a store admin preview Lulu's print + Mail-shipping + fulfillment cost
 * for a format/page-count combo before setting a retail price — a single
 * print-job-cost-calculations call against a fixed reference address (no
 * real order, no real shipment). fulfillmentCents is Lulu's per-order
 * fulfillment fee, surfaced separately so it isn't mistaken for print or
 * shipping cost — it's an org cost, not something charged to the buyer.
 */
export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  if (!isLuluConfigured()) return json({ error: "Lulu isn't configured" }, 503);

  const parsed = schema.safeParse(await context.request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);

  try {
    const { printCents, shippingCents, fulfillmentCents } = await calculatePrintJobCost({
      lineItems: [{
        podPackageId: podPackageIdForFormat(parsed.data.luluFormat),
        pageCount: parsed.data.pageCount,
        quantity: parsed.data.quantity,
      }],
      address: REFERENCE_ADDRESS,
      level: "MAIL",
    });
    return json({ printCents, mailShippingCents: shippingCents, fulfillmentCents });
  } catch (e) {
    if (e instanceof LuluApiError) return json({ error: "Cost preview failed" }, 502);
    throw e;
  }
};
