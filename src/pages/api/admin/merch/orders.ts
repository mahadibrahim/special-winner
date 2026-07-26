import type { APIRoute } from "astro";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchOrders, merchOrderItems } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getStoreById } from "@/lib/merch/stores";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const patchSchema = z.object({
  orderId: z.string().uuid(),
  status: z.literal("collected"),
});

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
    const { orderId } = parsed.data;

    const db = getDb();
    const [order] = await db.select().from(merchOrders).where(eq(merchOrders.id, orderId)).limit(1);
    if (!order) return json({ error: "Not found" }, 404);

    // Tenant isolation: the order's store must resolve inside the caller's org.
    const store = await getStoreById(auth.organizationId, order.storeId);
    if (!store) return json({ error: "Not found" }, 404);

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
  } catch (error) {
    console.error("Error marking merch order collected:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};
