import { getDb } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { merchVariants, merchProducts, type ProductPersonalization } from "@/lib/db/schema";

export type MerchFulfillmentType = "printful_pod" | "self_shipped" | "pickup" | "digital" | "lulu_pod";

export interface RepricedLine {
  variantId: string;
  fulfillmentType: MerchFulfillmentType;
  printfulVariantId: number | null;
  printfulSyncVariantId: string | null;
  productName: string;
  variantName: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  personalizationConfig: ProductPersonalization | null;
  quantity: number;
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  // Lulu POD book metadata (null for non-book lines) — feeds the Lulu cost calc.
  luluPodPackageId: string | null;
  luluPageCount: number | null;
  // Bundle attribution (merch Phase 3d). Optional: product lines omit these.
  bundleId?: string | null;
  bundleName?: string | null;
}

export interface VariantPriceRow {
  id: string;
  printfulVariantId: number | null;
  printfulSyncVariantId: string | null;
  variantName: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
  productName: string;
  fulfillmentType: MerchFulfillmentType;
  personalizationConfig: ProductPersonalization | null;
  weightOz: number | null;
  lengthIn: number | null;
  widthIn: number | null;
  heightIn: number | null;
  // Lulu POD book metadata (null for non-book lines) — feeds the Lulu cost calc.
  luluPodPackageId: string | null;
  luluPageCount: number | null;
}

/** Pure: match requested (variantId, quantity) items to fetched rows. Dedup-safe. */
export function matchRequestedToRows(
  items: { variantId: string; quantity: number }[],
  rows: VariantPriceRow[],
): { ok: true; lines: RepricedLine[] } | { ok: false } {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines: RepricedLine[] = [];
  for (const it of items) {
    const r = byId.get(it.variantId);
    if (!r) return { ok: false };
    lines.push({
      variantId: r.id,
      fulfillmentType: r.fulfillmentType,
      printfulVariantId: r.printfulVariantId,
      printfulSyncVariantId: r.printfulSyncVariantId,
      productName: r.productName,
      variantName: r.variantName,
      size: r.size,
      color: r.color,
      unitPriceCents: r.retailPriceCents,
      personalizationConfig: r.personalizationConfig,
      quantity: it.quantity,
      weightOz: r.weightOz,
      lengthIn: r.lengthIn,
      widthIn: r.widthIn,
      heightIn: r.heightIn,
      luluPodPackageId: r.luluPodPackageId,
      luluPageCount: r.luluPageCount,
    });
  }
  return { ok: true, lines };
}

/** Server-authoritative reprice of items within a single store. No source filter —
 * printful and manual/pickup lines both price from merch_variants. */
export async function repriceStoreCartItems(
  storeId: string,
  items: { variantId: string; quantity: number }[],
): Promise<{ ok: true; lines: RepricedLine[] } | { ok: false }> {
  const ids = [...new Set(items.map((i) => i.variantId))];
  if (ids.length === 0) return { ok: false };
  const rows = await getDb()
    .select({
      id: merchVariants.id,
      printfulVariantId: merchVariants.printfulVariantId,
      printfulSyncVariantId: merchVariants.printfulSyncVariantId,
      variantName: merchVariants.name,
      size: merchVariants.size,
      color: merchVariants.color,
      retailPriceCents: merchVariants.retailPriceCents,
      productName: merchProducts.name,
      fulfillmentType: merchProducts.fulfillmentType,
      personalizationConfig: merchProducts.personalization,
      weightOz: merchVariants.weightOz,
      lengthIn: merchVariants.lengthIn,
      widthIn: merchVariants.widthIn,
      heightIn: merchVariants.heightIn,
      luluPodPackageId: merchProducts.luluPodPackageId,
      luluPageCount: merchProducts.luluPageCount,
    })
    .from(merchVariants)
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(and(
      inArray(merchVariants.id, ids),
      eq(merchVariants.active, true),
      eq(merchProducts.active, true),
      eq(merchProducts.storeId, storeId),
    ));
  return matchRequestedToRows(items, rows as VariantPriceRow[]);
}
