import type { APIRoute } from "astro";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getStoreById } from "@/lib/merch/stores";
import { sendMerchShippedEmail } from "@/lib/merch/order-confirmation-email";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const patchSchema = z.discriminatedUnion("status", [
  z.object({
    orderId: z.string().uuid(),
    status: z.literal("collected"),
  }),
  z.object({
    orderId: z.string().uuid(),
    status: z.literal("shipped"),
    // Kept loose at the schema level (business-rule emptiness is checked
    // after parsing so it can return a distinct 422, not a 400 shape error —
    // mirrors the `missingSelfShippedWeights` 422 in store-products.ts).
    trackingNumber: z.string().optional(),
    trackingUrl: z.string().url().optional(),
    carrier: z.string().min(1).max(60).optional(),
    service: z.string().min(1).max(120).optional(),
  }),
]);

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const storeId = new URL(context.request.url).searchParams.get("storeId");
    if (!storeId || !z.string().uuid().safeParse(storeId).success) {
      return json({ error: "Valid storeId required" }, 400);
    }
    const store = await getStoreById(auth.organizationId, storeId);
    if (!store) return json({ error: "Not found" }, 404);

    const orders = await getDb()
      .select()
      .from(merchOrders)
      .where(eq(merchOrders.storeId, storeId))
      .orderBy(desc(merchOrders.createdAt));

    const withItems = await Promise.all(
      orders.map(async (order) => ({
        ...order,
        items: await getDb()
          .select()
          .from(merchOrderItems)
          .where(eq(merchOrderItems.orderId, order.id)),
      })),
    );

    return json({ orders: withItems });
  } catch (error) {
    console.error("Error fetching merch orders:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const parsed = patchSchema.safeParse(await context.request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const body = parsed.data;
    const { orderId } = body;

    const db = getDb();
    const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
    if (!order) return json({ error: "Not found" }, 404);

    // Tenant isolation: the order's store must resolve inside the caller's org.
    const store = await getStoreById(auth.organizationId, order.storeId);
    if (!store) return json({ error: "Not found" }, 404);

    if (body.status === "collected") {
      if (order.status !== "awaiting_pickup") {
        return json({ error: `Cannot mark collected from status '${order.status}'` }, 409);
      }

      const [updated] = await db
        .update(merchOrders)
        .set({ status: "collected", updatedAt: new Date() })
        .where(and(eq(merchOrders.id, orderId), eq(merchOrders.storeId, store.id)))
        .returning();
      if (!updated) return json({ error: "Not found" }, 404);

      return json({ order: updated });
    }

    // status === "shipped" — a self-shipped order the org hands to a
    // carrier itself (no Printful order, no automatic tracking submission).
    const trackingNumber = body.trackingNumber?.trim();
    if (!trackingNumber) {
      return json({ error: "trackingNumber is required" }, 422);
    }

    if (order.status !== "paid") {
      return json({ error: `Cannot mark shipped from status '${order.status}'` }, 409);
    }

    // A `paid` order isn't proof it's self-shipped — a Printful order whose
    // fulfillMerchOrder submission failed is intentionally left `paid` for
    // retry (see fulfillMerchOrder in src/lib/merch/fulfillment.ts), and a
    // mixed pickup+self_shipped order routes through the printful catch-all
    // too. Marking either of those "shipped" here would fire a fabricated
    // tracking email and silently drop the order out of the stuck-paid
    // retry pool. Only an order where every line is self_shipped qualifies.
    const items = await db
      .select({ fulfillmentType: merchOrderItems.fulfillmentType })
      .from(merchOrderItems)
      .where(eq(merchOrderItems.orderId, orderId));
    if (items.length === 0 || items.some((i) => i.fulfillmentType !== "self_shipped")) {
      return json({ error: "Only self-shipped orders can be marked shipped." }, 409);
    }

    const [updated] = await db
      .update(merchOrders)
      .set({
        status: "shipped",
        trackingNumber,
        trackingUrl: body.trackingUrl ?? order.trackingUrl,
        // Only fill carrier/service if the order doesn't already have one —
        // never clobber a value set elsewhere.
        shippingCarrier: order.shippingCarrier ?? body.carrier ?? null,
        shippingService: order.shippingService ?? body.service ?? null,
        shippedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(merchOrders.id, orderId), eq(merchOrders.storeId, store.id)))
      .returning();
    if (!updated) return json({ error: "Not found" }, 404);

    try {
      await sendMerchShippedEmail(orderId);
    } catch (e) {
      console.error(`[merch] shipped email failed for ${orderId}:`, e);
    }

    return json({ order: updated });
  } catch (error) {
    console.error("Error updating merch order:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};
