import { getDb } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import {
  merchProducts,
  merchVariants,
  type MerchProduct,
  type MerchVariant,
  type MerchImage,
} from "@/lib/db/schema";

export interface MerchListItem {
  id: string;
  name: string;
  slug: string;
  imageUrl: string | null;
  fromCents: number | null;
}

export function priceRangeCents(
  variants: { retailPriceCents: number }[],
): { minCents: number; maxCents: number } | null {
  if (variants.length === 0) return null;
  let min = variants[0].retailPriceCents;
  let max = variants[0].retailPriceCents;
  for (const v of variants) {
    if (v.retailPriceCents < min) min = v.retailPriceCents;
    if (v.retailPriceCents > max) max = v.retailPriceCents;
  }
  return { minCents: min, maxCents: max };
}

export function primaryImageUrl(images: MerchImage[] | null): string | null {
  return images && images.length > 0 ? images[0].url : null;
}

/** Active products for a store, with a cover image + "from" price. */
export async function listActiveMerchProducts(
  storeId: string,
): Promise<MerchListItem[]> {
  const db = getDb();
  const products = await db
    .select()
    .from(merchProducts)
    .where(and(eq(merchProducts.storeId, storeId), eq(merchProducts.active, true)))
    .orderBy(asc(merchProducts.sortOrder), asc(merchProducts.name));

  const items: MerchListItem[] = [];
  for (const p of products) {
    const variants = await db
      .select({ retailPriceCents: merchVariants.retailPriceCents })
      .from(merchVariants)
      .where(and(eq(merchVariants.productId, p.id), eq(merchVariants.active, true)));
    const range = priceRangeCents(variants);
    items.push({
      id: p.id,
      name: p.name,
      slug: p.slug,
      imageUrl: primaryImageUrl(p.images),
      fromCents: range?.minCents ?? null,
    });
  }
  return items;
}

/** One product (by store + slug) with its active variants; null if missing. */
export async function getMerchProductBySlug(
  storeId: string,
  slug: string,
): Promise<{ product: MerchProduct; variants: MerchVariant[] } | null> {
  const db = getDb();
  const [product] = await db
    .select()
    .from(merchProducts)
    .where(
      and(
        eq(merchProducts.storeId, storeId),
        eq(merchProducts.slug, slug),
        eq(merchProducts.active, true),
      ),
    )
    .limit(1);
  if (!product) return null;

  const variants = await db
    .select()
    .from(merchVariants)
    .where(and(eq(merchVariants.productId, product.id), eq(merchVariants.active, true)))
    .orderBy(asc(merchVariants.sortOrder), asc(merchVariants.retailPriceCents));

  return { product, variants };
}
