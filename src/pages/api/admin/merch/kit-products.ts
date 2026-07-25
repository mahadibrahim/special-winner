import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchProducts, merchVariants } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getKitById } from "@/lib/merch/kits";

const productSchema = z.object({
  kitId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional().nullable(),
  category: z.enum(["jersey","shorts","socks","hoodie","t_shirt","hat","bag","accessory","other"]).default("jersey"),
  imageUrl: z.string().url().optional().nullable(),
  priceCents: z.number().int().min(0),
  sizes: z.array(z.string().min(1).max(40)).min(1),
  personalization: z.object({ name: z.boolean().optional(), number: z.boolean().optional() }).optional().nullable(),
  active: z.boolean().default(true),
});

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const slugify = (n: string) => n.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const kitId = new URL(context.request.url).searchParams.get("kitId");
    if (!kitId) return json({ error: "kitId required" }, 400);
    if (!(await getKitById(auth.organizationId, kitId))) return json({ error: "Not found" }, 404);
    const products = await getDb().select().from(merchProducts).where(eq(merchProducts.kitId, kitId));
    const withVariants = await Promise.all(products.map(async (p) => ({
      ...p,
      variants: await getDb().select().from(merchVariants).where(eq(merchVariants.productId, p.id)),
    })));
    return json({ products: withVariants });
  } catch (error) {
    console.error("Error fetching kit products:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const parsed = productSchema.safeParse(await context.request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const kit = await getKitById(auth.organizationId, parsed.data.kitId);
    if (!kit) return json({ error: "Kit not found" }, 404);
    const db = getDb();
    const d = parsed.data;
    // slug unique per org — suffix the kit id fragment to avoid collisions across kits
    const slug = `${slugify(d.name)}-${parsed.data.kitId.slice(0, 8)}`;
    const [product] = await db.insert(merchProducts).values({
      organizationId: auth.organizationId,
      printfulSyncProductId: null,
      source: "manual",
      fulfillmentType: "pickup",
      kitId: d.kitId,
      name: d.name,
      slug,
      description: d.description ?? null,
      category: d.category,
      images: d.imageUrl ? [{ url: d.imageUrl }] : null,
      personalization: d.personalization ?? null,
      active: d.active,
    }).returning({ id: merchProducts.id });
    await db.insert(merchVariants).values(d.sizes.map((size, i) => ({
      productId: product.id,
      printfulSyncVariantId: null,
      printfulVariantId: null,
      name: `${d.name} / ${size}`,
      size,
      color: null,
      sku: null,
      retailPriceCents: d.priceCents,
      sortOrder: i,
    })));
    return json({ productId: product.id }, 201);
  } catch (error) {
    console.error("Error creating kit product:", error);
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
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const d = parsed.data;

    const db = getDb();
    const [existing] = await db.select().from(merchProducts).where(eq(merchProducts.id, id)).limit(1);
    if (!existing || !existing.kitId) return json({ error: "Not found" }, 404);
    // tenant isolation: the product's current kit must resolve inside the caller's org
    if (!(await getKitById(auth.organizationId, existing.kitId))) return json({ error: "Not found" }, 404);
    // if the request moves the product to a different kit, that target kit must also be in-org
    const targetKit = await getKitById(auth.organizationId, d.kitId);
    if (!targetKit) return json({ error: "Kit not found" }, 404);

    const slug = d.name === existing.name ? existing.slug : `${slugify(d.name)}-${d.kitId.slice(0, 8)}`;

    await db.transaction(async (tx) => {
      await tx.update(merchProducts).set({
        kitId: d.kitId,
        name: d.name,
        slug,
        description: d.description ?? null,
        category: d.category,
        images: d.imageUrl ? [{ url: d.imageUrl }] : null,
        personalization: d.personalization ?? null,
        active: d.active,
        updatedAt: new Date(),
      }).where(eq(merchProducts.id, id));

      await tx.delete(merchVariants).where(eq(merchVariants.productId, id));
      await tx.insert(merchVariants).values(d.sizes.map((size, i) => ({
        productId: id,
        printfulSyncVariantId: null,
        printfulVariantId: null,
        name: `${d.name} / ${size}`,
        size,
        color: null,
        sku: null,
        retailPriceCents: d.priceCents,
        sortOrder: i,
      })));
    });

    return json({ productId: id });
  } catch (error) {
    console.error("Error updating kit product:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const id = new URL(context.request.url).searchParams.get("id");
    if (!id || !z.string().uuid().safeParse(id).success) return json({ error: "Valid id required" }, 400);

    const db = getDb();
    const [existing] = await db.select().from(merchProducts).where(eq(merchProducts.id, id)).limit(1);
    if (!existing || !existing.kitId) return json({ error: "Not found" }, 404);
    // tenant isolation: the product's kit must resolve inside the caller's org
    if (!(await getKitById(auth.organizationId, existing.kitId))) return json({ error: "Not found" }, 404);

    // cascades to merch_variants via the FK's onDelete: "cascade"
    await db.delete(merchProducts).where(eq(merchProducts.id, id));
    return json({ success: true });
  } catch (error) {
    console.error("Error deleting kit product:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};
