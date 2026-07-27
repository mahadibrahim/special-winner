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

/** A lulu_pod product's linked digital companion ("one book listing, two
 *  formats"), as the storefront format picker needs it. `variantId` is the
 *  companion's own (single) variant — choosing "Digital PDF" on the format
 *  picker adds THIS variant to the cart instead of the print product's. */
export interface CompanionSummary {
  id: string;
  slug: string;
  name: string;
  priceCents: number;
  variantId: string;
}

/**
 * Drop any product referenced as ANOTHER product's digitalCompanionId —
 * a digital companion is a format of its paired print book, not its own
 * storefront listing, so it must not appear as its own card in the grid.
 * Pure/order-preserving so it's unit-testable without a DB.
 */
export function excludeCompanionProducts<T extends { id: string }>(
  products: (T & { digitalCompanionId: string | null })[],
): T[] {
  const companionIds = new Set(
    products.map((p) => p.digitalCompanionId).filter((id): id is string => id != null),
  );
  return products.filter((p) => !companionIds.has(p.id));
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
  const allProducts = await db
    .select()
    .from(merchProducts)
    .where(and(eq(merchProducts.storeId, storeId), eq(merchProducts.active, true)))
    .orderBy(asc(merchProducts.sortOrder), asc(merchProducts.name));
  // A digital product paired as a book's companion is a format, not its own
  // listing — it must not show up as a separate card in the grid.
  const products = excludeCompanionProducts(allProducts);

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

/**
 * One product (by store + slug) with its active variants; null if missing.
 * For a lulu_pod product with a linked digital companion ("one book listing,
 * two formats"), also resolves `companion` (id/name/price) so the storefront
 * can render a format picker — null if there's no link, or the linked
 * product/its price can no longer be resolved (e.g. deactivated).
 */
export async function getMerchProductBySlug(
  storeId: string,
  slug: string,
): Promise<{ product: MerchProduct; variants: MerchVariant[]; companion: CompanionSummary | null } | null> {
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

  const companion = await resolveCompanion(db, product);

  return { product, variants, companion };
}

/** Resolve a lulu_pod product's linked digital companion, if any, for the
 *  storefront format picker. Only meaningful for lulu_pod — companion links
 *  aren't persisted for any other fulfillmentType (see store-products.ts). */
async function resolveCompanion(
  db: ReturnType<typeof getDb>,
  product: MerchProduct,
): Promise<CompanionSummary | null> {
  if (product.fulfillmentType !== "lulu_pod" || !product.digitalCompanionId) return null;

  const [companionProduct] = await db
    .select()
    .from(merchProducts)
    .where(and(eq(merchProducts.id, product.digitalCompanionId), eq(merchProducts.active, true)))
    .limit(1);
  if (!companionProduct) return null;

  const [variant] = await db
    .select({ id: merchVariants.id, retailPriceCents: merchVariants.retailPriceCents })
    .from(merchVariants)
    .where(and(eq(merchVariants.productId, companionProduct.id), eq(merchVariants.active, true)))
    .orderBy(asc(merchVariants.sortOrder), asc(merchVariants.retailPriceCents))
    .limit(1);
  if (!variant) return null;

  return {
    id: companionProduct.id,
    slug: companionProduct.slug,
    name: companionProduct.name,
    priceCents: variant.retailPriceCents,
    variantId: variant.id,
  };
}
