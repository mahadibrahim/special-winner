import type { APIRoute } from "astro";
import { z } from "zod";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchBundles, merchBundleItems, merchProducts } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getStoreById } from "@/lib/merch/stores";
import { getBundleById, getBundleBySlug } from "@/lib/merch/bundles";

const imageSchema = z.object({ url: z.string().url(), alt: z.string().optional() });

const componentSchema = z.object({
  productId: z.string().uuid(),
  label: z.string().max(255).optional().nullable(),
  quantity: z.number().int().positive().default(1),
});

const bundleSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(1).max(255),
  slug: z.string().min(1).max(140).optional().nullable(),
  description: z.string().max(4000).optional().nullable(),
  discountType: z.enum(["percent", "fixed"]),
  discountValue: z.number().int(),
  active: z.boolean().default(true),
  images: z.array(imageSchema).optional().nullable(),
  components: z.array(componentSchema).min(1),
});

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const slugify = (n: string) => n.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

/** Format-level validation for the discount value: percent must be 0..100, fixed must be >= 0. */
function discountRangeError(type: "percent" | "fixed", value: number): string | null {
  if (type === "percent" && (value < 0 || value > 100)) {
    return "discountValue must be between 0 and 100 for a percent discount";
  }
  if (type === "fixed" && value < 0) {
    return "discountValue must be >= 0 (cents) for a fixed discount";
  }
  return null;
}

/** Derives a unique-per-store slug: client-provided slug (slugified) or the
 *  name, suffixed -2, -3, ... on collision. `excludeId` lets an update keep
 *  its own slug without colliding with itself. */
async function uniqueBundleSlug(storeId: string, base: string, excludeId?: string): Promise<string> {
  const root = slugify(base) || "bundle";
  let candidate = root;
  let suffix = 2;
  for (;;) {
    const existing = await getBundleBySlug(storeId, candidate);
    if (!existing || existing.id === excludeId) return candidate;
    candidate = `${root}-${suffix}`;
    suffix += 1;
  }
}

/**
 * Resolves each component's product row (scoped to `storeId`) and confirms:
 *  - every componentId resolves to a product IN that store (else 422)
 *  - every resolved product shares one `fulfillment_type` (else 422)
 * Returns the shared fulfillment type on success.
 */
async function resolveSharedFulfillmentType(
  storeId: string,
  productIds: string[],
): Promise<{ fulfillmentType: string } | { error: string }> {
  const uniqueIds = [...new Set(productIds)];
  const products = await getDb()
    .select({ id: merchProducts.id, fulfillmentType: merchProducts.fulfillmentType })
    .from(merchProducts)
    .where(and(eq(merchProducts.storeId, storeId), inArray(merchProducts.id, uniqueIds)));
  if (products.length !== uniqueIds.length) {
    return { error: "One or more component products are not in this store" };
  }
  const types = new Set(products.map((p) => p.fulfillmentType));
  if (types.size > 1) {
    return { error: "All bundle items must have the same fulfillment type" };
  }
  return { fulfillmentType: products[0].fulfillmentType };
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const storeId = new URL(context.request.url).searchParams.get("storeId");
    if (!storeId || !z.string().uuid().safeParse(storeId).success) return json({ error: "Valid storeId required" }, 400);
    if (!(await getStoreById(auth.organizationId, storeId))) return json({ error: "Not found" }, 404);

    const db = getDb();
    const bundles = await db.select().from(merchBundles)
      .where(eq(merchBundles.storeId, storeId))
      .orderBy(asc(merchBundles.sortOrder), asc(merchBundles.name));
    const withItems = await Promise.all(bundles.map(async (b) => ({
      ...b,
      items: await db.select().from(merchBundleItems)
        .where(eq(merchBundleItems.bundleId, b.id))
        .orderBy(asc(merchBundleItems.sortOrder)),
    })));

    // Component picker source for the bundle editor: every product in this
    // store (any source), trimmed to the fields the picker needs. Returned
    // alongside the bundle list rather than as a separate endpoint call.
    const products = await db.select({
      id: merchProducts.id,
      name: merchProducts.name,
      fulfillmentType: merchProducts.fulfillmentType,
    }).from(merchProducts).where(eq(merchProducts.storeId, storeId));

    return json({ bundles: withItems, products });
  } catch (error) {
    console.error("Error fetching merch bundles:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const parsed = bundleSchema.safeParse(await context.request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const d = parsed.data;

    const discountError = discountRangeError(d.discountType, d.discountValue);
    if (discountError) return json({ error: discountError }, 400);

    const store = await getStoreById(auth.organizationId, d.storeId);
    if (!store) return json({ error: "Store not found" }, 404);

    const resolved = await resolveSharedFulfillmentType(d.storeId, d.components.map((c) => c.productId));
    if ("error" in resolved) return json({ error: resolved.error }, 422);

    const slug = await uniqueBundleSlug(d.storeId, d.slug ?? d.name);

    const db = getDb();
    const [bundle] = await db.transaction(async (tx) => {
      const [b] = await tx.insert(merchBundles).values({
        organizationId: auth.organizationId,
        storeId: d.storeId,
        name: d.name,
        slug,
        description: d.description ?? null,
        images: d.images ?? null,
        discountType: d.discountType,
        discountValue: d.discountValue,
        fulfillmentType: resolved.fulfillmentType as typeof merchBundles.$inferInsert.fulfillmentType,
        active: d.active,
      }).returning();
      await tx.insert(merchBundleItems).values(d.components.map((c, i) => ({
        bundleId: b.id,
        productId: c.productId,
        label: c.label ?? null,
        quantity: c.quantity,
        sortOrder: i,
      })));
      return [b];
    });
    return json({ bundleId: bundle.id }, 201);
  } catch (error) {
    console.error("Error creating merch bundle:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const body = await context.request.json().catch(() => null);
    const id = body?.id;
    if (!id || !z.string().uuid().safeParse(id).success) return json({ error: "Valid id required" }, 400);

    const existing = await getBundleById(auth.organizationId, id);
    if (!existing) return json({ error: "Not found" }, 404);

    const parsed = bundleSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const d = parsed.data;

    const discountError = discountRangeError(d.discountType, d.discountValue);
    if (discountError) return json({ error: discountError }, 400);

    // If the request moves the bundle to a different store, that target store must also be in-org.
    const targetStore = await getStoreById(auth.organizationId, d.storeId);
    if (!targetStore) return json({ error: "Store not found" }, 404);

    const resolved = await resolveSharedFulfillmentType(d.storeId, d.components.map((c) => c.productId));
    if ("error" in resolved) return json({ error: resolved.error }, 422);

    const slug = d.name === existing.name && d.storeId === existing.storeId
      ? existing.slug
      : await uniqueBundleSlug(d.storeId, d.slug ?? d.name, id);

    const db = getDb();
    await db.transaction(async (tx) => {
      await tx.update(merchBundles).set({
        storeId: d.storeId,
        name: d.name,
        slug,
        description: d.description ?? null,
        images: d.images ?? null,
        discountType: d.discountType,
        discountValue: d.discountValue,
        fulfillmentType: resolved.fulfillmentType as typeof merchBundles.$inferInsert.fulfillmentType,
        active: d.active,
        updatedAt: new Date(),
      }).where(eq(merchBundles.id, id));

      await tx.delete(merchBundleItems).where(eq(merchBundleItems.bundleId, id));
      await tx.insert(merchBundleItems).values(d.components.map((c, i) => ({
        bundleId: id,
        productId: c.productId,
        label: c.label ?? null,
        quantity: c.quantity,
        sortOrder: i,
      })));
    });

    return json({ bundleId: id });
  } catch (error) {
    console.error("Error updating merch bundle:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) return json({ error: "Valid id required" }, 400);

    const existing = await getBundleById(auth.organizationId, id);
    if (!existing) return json({ error: "Not found" }, 404);

    // Order line items snapshot bundle_name at purchase time, so deleting a
    // bundle is always safe — no order-reference block needed here. Cascades
    // to merch_bundle_items via the FK's onDelete: "cascade".
    await getDb().delete(merchBundles).where(eq(merchBundles.id, id));
    return json({ success: true });
  } catch (error) {
    console.error("Error deleting merch bundle:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};
