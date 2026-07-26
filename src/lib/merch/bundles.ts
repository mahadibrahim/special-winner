import { getDb } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import {
  merchBundles,
  merchBundleItems,
  merchProducts,
  merchVariants,
  type MerchBundle,
  type MerchBundleItem,
  type MerchVariant,
} from "@/lib/db/schema";
import { primaryImageUrl } from "./catalog";

export interface BundleGridItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  discountType: MerchBundle["discountType"];
  discountValue: number;
}

export interface BundleSlot {
  slot: MerchBundleItem;
  product: { id: string; name: string; slug: string };
  variants: MerchVariant[];
}

export interface BundleWithItems {
  bundle: MerchBundle;
  items: BundleSlot[];
}

/** One bundle by store + slug, active-agnostic (caller gates on active/window). */
export async function getBundleBySlug(
  storeId: string,
  slug: string,
): Promise<MerchBundle | null> {
  const [row] = await getDb()
    .select()
    .from(merchBundles)
    .where(and(eq(merchBundles.storeId, storeId), eq(merchBundles.slug, slug)))
    .limit(1);
  return row ?? null;
}

/** One bundle by org + id (tenant-scoped, for admin). */
export async function getBundleById(
  orgId: string,
  id: string,
): Promise<MerchBundle | null> {
  const [row] = await getDb()
    .select()
    .from(merchBundles)
    .where(and(eq(merchBundles.id, id), eq(merchBundles.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

/** One bundle by store + id (store-scoped, for quote/checkout). Active-agnostic — caller gates on active. */
export async function getBundleByStoreAndId(
  storeId: string,
  id: string,
): Promise<MerchBundle | null> {
  const [row] = await getDb()
    .select()
    .from(merchBundles)
    .where(and(eq(merchBundles.id, id), eq(merchBundles.storeId, storeId)))
    .limit(1);
  return row ?? null;
}

/** Active bundles for a store, deterministic order. */
export async function listBundles(storeId: string): Promise<MerchBundle[]> {
  return getDb()
    .select()
    .from(merchBundles)
    .where(and(eq(merchBundles.storeId, storeId), eq(merchBundles.active, true)))
    .orderBy(asc(merchBundles.sortOrder), asc(merchBundles.name));
}

/**
 * A bundle's slots, each with its product (name/slug) and that product's
 * active variants — the allowed choices for that slot. Ordered by slot sortOrder.
 */
export async function getBundleWithItems(
  bundleId: string,
): Promise<BundleWithItems | null> {
  const db = getDb();
  const [bundle] = await db
    .select()
    .from(merchBundles)
    .where(eq(merchBundles.id, bundleId))
    .limit(1);
  if (!bundle) return null;

  const slots = await db
    .select({
      slot: merchBundleItems,
      product: {
        id: merchProducts.id,
        name: merchProducts.name,
        slug: merchProducts.slug,
      },
    })
    .from(merchBundleItems)
    .innerJoin(merchProducts, eq(merchBundleItems.productId, merchProducts.id))
    .where(eq(merchBundleItems.bundleId, bundleId))
    .orderBy(asc(merchBundleItems.sortOrder));

  const items: BundleSlot[] = [];
  for (const { slot, product } of slots) {
    const variants = await db
      .select()
      .from(merchVariants)
      .where(and(eq(merchVariants.productId, product.id), eq(merchVariants.active, true)))
      .orderBy(asc(merchVariants.sortOrder), asc(merchVariants.retailPriceCents));
    items.push({ slot, product, variants });
  }

  return { bundle, items };
}

/** Active bundles for the store grid, cover image = first of `images`. */
export async function listStoreBundlesForGrid(
  storeId: string,
): Promise<BundleGridItem[]> {
  const bundles = await listBundles(storeId);
  return bundles.map((b) => ({
    id: b.id,
    name: b.name,
    slug: b.slug,
    imageUrl: primaryImageUrl(b.images),
    discountType: b.discountType,
    discountValue: b.discountValue,
  }));
}
