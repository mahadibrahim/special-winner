import type { APIRoute } from "astro";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { merchProducts, merchVariants } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import { getStoreById } from "@/lib/merch/stores";
import { podPackageIdForFormat } from "@/lib/lulu/formats";

// Per-size shipping dims, keyed by `size` (matched against the `sizes` array
// below). Kept as a separate, optional array — rather than turning `sizes`
// into an array of objects — so existing manual (pickup) callers that only
// ever send `sizes: string[]` are untouched.
const variantWeightSchema = z.object({
  size: z.string().min(1).max(40),
  weightOz: z.number().int().positive().optional(),
  lengthIn: z.number().int().positive().optional(),
  widthIn: z.number().int().positive().optional(),
  heightIn: z.number().int().positive().optional(),
});

const productSchema = z.object({
  storeId: z.string().uuid(),
  name: z.string().min(1).max(255),
  description: z.string().max(4000).optional().nullable(),
  category: z.enum(["jersey","shorts","socks","hoodie","t_shirt","hat","bag","accessory","other"]).default("jersey"),
  imageUrl: z.string().url().optional().nullable(),
  priceCents: z.number().int().min(0),
  fulfillmentType: z.enum(["pickup", "self_shipped", "digital", "lulu_pod"]).default("pickup"),
  // Digital and lulu_pod (print-on-demand book) products have no sizes —
  // exactly one variant is created at priceCents. Sizes are required for
  // pickup/self_shipped (enforced below, not via .min(1) here, since that
  // would also reject digital/lulu_pod submissions).
  sizes: z.array(z.string().min(1).max(40)).default([]),
  variantWeights: z.array(variantWeightSchema).optional(),
  // Required (checked below, 422) when fulfillmentType is "digital" — the
  // storage key + buyer-facing filename for the uploaded download.
  digitalAssetKey: z.string().min(1).max(500).optional(),
  digitalAssetName: z.string().min(1).max(255).optional(),
  // Required (checked below, 422) when fulfillmentType is "lulu_pod" — the
  // curated print format, page count, and both uploaded interior/cover PDFs.
  // luluPodPackageId is never accepted from the client — it's derived
  // server-side from luluFormat below.
  luluFormat: z.enum(["6x9_bw", "6x9_color"]).optional(),
  luluPageCount: z.number().int().min(2).max(800).optional(),
  luluInteriorAssetKey: z.string().min(1).max(500).optional(),
  luluCoverAssetKey: z.string().min(1).max(500).optional(),
  // "One book listing, two formats": optionally pairs a lulu_pod book with
  // the digital product it's sold alongside (checked below, 422 — only
  // lulu_pod products may set this, and the target must be a "digital"
  // product in the same store).
  digitalCompanionId: z.string().uuid().optional().nullable(),
  personalization: z.object({ name: z.boolean().optional(), number: z.boolean().optional() }).optional().nullable(),
  active: z.boolean().default(true),
}).superRefine((d, ctx) => {
  if (d.fulfillmentType !== "digital" && d.fulfillmentType !== "lulu_pod" && d.sizes.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Add at least one size", path: ["sizes"] });
  }
});

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
const slugify = (n: string) => n.toLowerCase().trim().replace(/[^a-z0-9\s-]/g, "").replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");

/** Extract the PG error code from a Drizzle-wrapped or raw pg error. */
function getDbErrorCode(error: any): string | undefined {
  return error?.code ?? error?.cause?.code;
}

/**
 * For self-shipped products, every size in `sizes` must have a positive
 * `weightOz` entry in `variantWeights` — Printful/Shippo rate lookups need a
 * real parcel weight per variant (see `parcelForLines` in `src/lib/shipping`).
 * Returns the offending sizes (empty array = valid); pickup products are
 * exempt since they never enter the shipping-rate path.
 */
function missingSelfShippedWeights(
  fulfillmentType: "pickup" | "self_shipped" | "digital" | "lulu_pod",
  sizes: string[],
  variantWeights?: z.infer<typeof variantWeightSchema>[],
): string[] {
  if (fulfillmentType !== "self_shipped") return [];
  const weightBySize = new Map((variantWeights ?? []).map((vw) => [vw.size, vw.weightOz]));
  return sizes.filter((size) => {
    const w = weightBySize.get(size);
    return w == null || w <= 0;
  });
}

/** Digital products must have an uploaded asset — checked separately from
 * the zod schema so the failure mode matches missingSelfShippedWeights (422,
 * not a generic 400 schema-validation error). */
function missingDigitalAsset(
  fulfillmentType: "pickup" | "self_shipped" | "digital" | "lulu_pod",
  digitalAssetKey?: string,
  digitalAssetName?: string,
): boolean {
  return fulfillmentType === "digital" && (!digitalAssetKey || !digitalAssetName);
}

/** A lulu_pod product needs its full print spec — format, page count, and
 * both uploaded PDFs. 422 (not 400) to match the other business-rule checks. */
function missingLuluFields(d: { fulfillmentType: string; luluFormat?: string; luluPageCount?: number; luluInteriorAssetKey?: string; luluCoverAssetKey?: string }): boolean {
  return d.fulfillmentType === "lulu_pod" &&
    !(d.luluFormat && d.luluPageCount && d.luluInteriorAssetKey && d.luluCoverAssetKey);
}

/** Same cross-org R2-key leak guard as digitalAssetKeyOutsideOrg, for the
 * merch-books/ namespace (both interior and cover). */
function luluAssetKeyOutsideOrg(d: { fulfillmentType: string; luluInteriorAssetKey?: string; luluCoverAssetKey?: string }, organizationId: string): boolean {
  if (d.fulfillmentType !== "lulu_pod") return false;
  const prefix = `merch-books/${organizationId}/`;
  return [d.luluInteriorAssetKey, d.luluCoverAssetKey].some((k) => k != null && !k.startsWith(prefix));
}

/**
 * A digital product's asset key must live under the caller's own org
 * namespace (as minted by /api/admin/merch/digital-asset-url:
 * `merch-digital/<orgId>/...`). Without this check, an org admin could
 * submit ANOTHER org's real R2 key and have /shop/download/[token] sign a
 * GET for it, leaking that org's file to their own buyers. Only meaningful
 * (and only invoked) when fulfillmentType is "digital" and the key is
 * present — missingDigitalAsset covers the absent case.
 */
function digitalAssetKeyOutsideOrg(
  fulfillmentType: "pickup" | "self_shipped" | "digital" | "lulu_pod",
  digitalAssetKey: string | undefined,
  organizationId: string,
): boolean {
  if (fulfillmentType !== "digital" || !digitalAssetKey) return false;
  return !digitalAssetKey.startsWith(`merch-digital/${organizationId}/`);
}

/**
 * A digitalCompanionId (the "one book listing, two formats" link) may only
 * be set on a lulu_pod product, and must point at a real "digital" product
 * in the SAME store as the caller's product. Same store also guarantees
 * same org here, since getStoreById above already scoped `storeId` (and
 * therefore the target store) to the caller's org — but the target
 * product's own organizationId is checked directly too, for defense in
 * depth. 422 (not 400) to match the other business-rule checks.
 */
async function invalidDigitalCompanion(
  d: { fulfillmentType: string; digitalCompanionId?: string | null; storeId: string },
  organizationId: string,
): Promise<boolean> {
  if (!d.digitalCompanionId) return false;
  if (d.fulfillmentType !== "lulu_pod") return true;
  const db = getDb();
  const [companion] = await db
    .select()
    .from(merchProducts)
    .where(eq(merchProducts.id, d.digitalCompanionId))
    .limit(1);
  if (!companion) return true;
  if (companion.organizationId !== organizationId) return true;
  if (companion.storeId !== d.storeId) return true;
  if (companion.fulfillmentType !== "digital") return true;
  return false;
}

/**
 * Build the variant rows to insert for a product. Digital and lulu_pod
 * (print-on-demand book) products get exactly one variant at the product
 * price (no size, no weight/dims — there's nothing to ship, or shipping is
 * computed live from the Lulu package/page count instead of a stocked
 * weight). Pickup/self_shipped get one variant per size, optionally carrying
 * per-size shipping weight/dims for self_shipped.
 */
function buildVariantRows(
  d: z.infer<typeof productSchema>,
  productId: string,
  weightBySize: Map<string, z.infer<typeof variantWeightSchema>>,
) {
  if (d.fulfillmentType === "digital" || d.fulfillmentType === "lulu_pod") {
    return [
      {
        productId,
        printfulSyncVariantId: null,
        printfulVariantId: null,
        name: d.name,
        size: null,
        color: null,
        sku: null,
        retailPriceCents: d.priceCents,
        weightOz: null,
        lengthIn: null,
        widthIn: null,
        heightIn: null,
        sortOrder: 0,
      },
    ];
  }
  return d.sizes.map((size, i) => {
    const dims = d.fulfillmentType === "self_shipped" ? weightBySize.get(size) : undefined;
    return {
      productId,
      printfulSyncVariantId: null,
      printfulVariantId: null,
      name: `${d.name} / ${size}`,
      size,
      color: null,
      sku: null,
      retailPriceCents: d.priceCents,
      weightOz: dims?.weightOz ?? null,
      lengthIn: dims?.lengthIn ?? null,
      widthIn: dims?.widthIn ?? null,
      heightIn: dims?.heightIn ?? null,
      sortOrder: i,
    };
  });
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const storeId = new URL(context.request.url).searchParams.get("storeId");
    if (!storeId || !z.string().uuid().safeParse(storeId).success) return json({ error: "Valid storeId required" }, 400);
    if (!(await getStoreById(auth.organizationId, storeId))) return json({ error: "Not found" }, 404);
    // manual-only: Printful-synced products are managed via the sync flow, not this editor
    const products = await getDb().select().from(merchProducts)
      .where(and(eq(merchProducts.storeId, storeId), eq(merchProducts.source, "manual")));
    const withVariants = await Promise.all(products.map(async (p) => ({
      ...p,
      variants: await getDb().select().from(merchVariants).where(eq(merchVariants.productId, p.id)),
    })));
    return json({ products: withVariants });
  } catch (error) {
    console.error("Error fetching store products:", error);
    return json({ error: "Something went wrong" }, 500);
  }
};

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  try {
    const parsed = productSchema.safeParse(await context.request.json().catch(() => null));
    if (!parsed.success) return json({ error: "Invalid", details: parsed.error.flatten() }, 400);
    const store = await getStoreById(auth.organizationId, parsed.data.storeId);
    if (!store) return json({ error: "Store not found" }, 404);
    const d = parsed.data;
    const missingWeights = missingSelfShippedWeights(d.fulfillmentType, d.sizes, d.variantWeights);
    if (missingWeights.length) {
      return json({ error: `weightOz is required for self-shipped variants: ${missingWeights.join(", ")}` }, 422);
    }
    if (missingDigitalAsset(d.fulfillmentType, d.digitalAssetKey, d.digitalAssetName)) {
      return json({ error: "a digital product needs an uploaded file" }, 422);
    }
    if (digitalAssetKeyOutsideOrg(d.fulfillmentType, d.digitalAssetKey, auth.organizationId)) {
      return json({ error: "Invalid digital asset." }, 422);
    }
    if (missingLuluFields(d)) {
      return json({ error: "a book needs a format, page count, and both PDFs (interior + cover)" }, 422);
    }
    if (luluAssetKeyOutsideOrg(d, auth.organizationId)) {
      return json({ error: "Invalid book file." }, 422);
    }
    if (await invalidDigitalCompanion(d, auth.organizationId)) {
      return json({ error: "Invalid digital companion product." }, 422);
    }
    const db = getDb();
    const weightBySize = new Map((d.variantWeights ?? []).map((vw) => [vw.size, vw]));
    // slug unique per store — suffix the store id fragment for cross-store safety
    const slug = `${slugify(d.name)}-${parsed.data.storeId.slice(0, 8)}`;
    const [product] = await db.transaction(async (tx) => {
      const [prod] = await tx.insert(merchProducts).values({
        organizationId: auth.organizationId,
        printfulSyncProductId: null,
        source: "manual",
        fulfillmentType: d.fulfillmentType,
        storeId: d.storeId,
        name: d.name,
        slug,
        description: d.description ?? null,
        category: d.category,
        images: d.imageUrl ? [{ url: d.imageUrl }] : null,
        digitalAssetKey: d.fulfillmentType === "digital" ? d.digitalAssetKey ?? null : null,
        digitalAssetName: d.fulfillmentType === "digital" ? d.digitalAssetName ?? null : null,
        luluPodPackageId: d.fulfillmentType === "lulu_pod" && d.luluFormat ? podPackageIdForFormat(d.luluFormat) : null,
        luluPageCount: d.fulfillmentType === "lulu_pod" ? d.luluPageCount ?? null : null,
        luluInteriorAssetKey: d.fulfillmentType === "lulu_pod" ? d.luluInteriorAssetKey ?? null : null,
        luluCoverAssetKey: d.fulfillmentType === "lulu_pod" ? d.luluCoverAssetKey ?? null : null,
        digitalCompanionId: d.fulfillmentType === "lulu_pod" ? d.digitalCompanionId ?? null : null,
        personalization: d.personalization ?? null,
        active: d.active,
      }).returning({ id: merchProducts.id });
      await tx.insert(merchVariants).values(buildVariantRows(d, prod.id, weightBySize));
      return [prod];
    });
    return json({ productId: product.id }, 201);
  } catch (error) {
    console.error("Error creating store product:", error);
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
    const missingWeights = missingSelfShippedWeights(d.fulfillmentType, d.sizes, d.variantWeights);
    if (missingWeights.length) {
      return json({ error: `weightOz is required for self-shipped variants: ${missingWeights.join(", ")}` }, 422);
    }
    if (missingDigitalAsset(d.fulfillmentType, d.digitalAssetKey, d.digitalAssetName)) {
      return json({ error: "a digital product needs an uploaded file" }, 422);
    }
    if (digitalAssetKeyOutsideOrg(d.fulfillmentType, d.digitalAssetKey, auth.organizationId)) {
      return json({ error: "Invalid digital asset." }, 422);
    }
    if (missingLuluFields(d)) {
      return json({ error: "a book needs a format, page count, and both PDFs (interior + cover)" }, 422);
    }
    if (luluAssetKeyOutsideOrg(d, auth.organizationId)) {
      return json({ error: "Invalid book file." }, 422);
    }
    if (await invalidDigitalCompanion(d, auth.organizationId)) {
      return json({ error: "Invalid digital companion product." }, 422);
    }
    const weightBySize = new Map((d.variantWeights ?? []).map((vw) => [vw.size, vw]));

    const db = getDb();
    const [existing] = await db.select().from(merchProducts).where(eq(merchProducts.id, id)).limit(1);
    if (!existing || !existing.storeId) return json({ error: "Not found" }, 404);
    // tenant isolation: the product's current store must resolve inside the caller's org
    if (!(await getStoreById(auth.organizationId, existing.storeId))) return json({ error: "Not found" }, 404);
    // manual-only: never let this endpoint touch Printful-synced products
    if (existing.source !== "manual") {
      return json({ error: "Only manually-created products can be edited here." }, 400);
    }
    // if the request moves the product to a different store, that target store must also be in-org
    const targetStore = await getStoreById(auth.organizationId, d.storeId);
    if (!targetStore) return json({ error: "Store not found" }, 404);

    const slug = d.name === existing.name ? existing.slug : `${slugify(d.name)}-${d.storeId.slice(0, 8)}`;

    await db.transaction(async (tx) => {
      await tx.update(merchProducts).set({
        storeId: d.storeId,
        name: d.name,
        slug,
        description: d.description ?? null,
        category: d.category,
        fulfillmentType: d.fulfillmentType,
        images: d.imageUrl ? [{ url: d.imageUrl }] : null,
        digitalAssetKey: d.fulfillmentType === "digital" ? d.digitalAssetKey ?? null : null,
        digitalAssetName: d.fulfillmentType === "digital" ? d.digitalAssetName ?? null : null,
        luluPodPackageId: d.fulfillmentType === "lulu_pod" && d.luluFormat ? podPackageIdForFormat(d.luluFormat) : null,
        luluPageCount: d.fulfillmentType === "lulu_pod" ? d.luluPageCount ?? null : null,
        luluInteriorAssetKey: d.fulfillmentType === "lulu_pod" ? d.luluInteriorAssetKey ?? null : null,
        luluCoverAssetKey: d.fulfillmentType === "lulu_pod" ? d.luluCoverAssetKey ?? null : null,
        digitalCompanionId: d.fulfillmentType === "lulu_pod" ? d.digitalCompanionId ?? null : null,
        personalization: d.personalization ?? null,
        active: d.active,
        updatedAt: new Date(),
      }).where(eq(merchProducts.id, id));

      await tx.delete(merchVariants).where(eq(merchVariants.productId, id));
      await tx.insert(merchVariants).values(buildVariantRows(d, id, weightBySize));
    });

    return json({ productId: id });
  } catch (error) {
    console.error("Error updating store product:", error);
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
    if (!existing || !existing.storeId) return json({ error: "Not found" }, 404);
    // tenant isolation: the product's store must resolve inside the caller's org
    if (!(await getStoreById(auth.organizationId, existing.storeId))) return json({ error: "Not found" }, 404);
    // manual-only: never let this endpoint touch Printful-synced products
    if (existing.source !== "manual") {
      return json({ error: "Only manually-created products can be edited here." }, 400);
    }

    // cascades to merch_variants via the FK's onDelete: "cascade"
    await db.delete(merchProducts).where(eq(merchProducts.id, id));
    return json({ success: true });
  } catch (error) {
    console.error("Error deleting store product:", error);
    // merch_bundle_items.product_id is onDelete: "restrict" — a product used
    // as a bundle component can't be hard-deleted while the bundle exists.
    if (getDbErrorCode(error) === "23503") {
      return json({ error: "Cannot delete a product that is used in a bundle. Remove it from the bundle first." }, 409);
    }
    return json({ error: "Something went wrong" }, 500);
  }
};
