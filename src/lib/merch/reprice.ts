import { getDb } from "@/lib/db";
import { and, eq, inArray } from "drizzle-orm";
import { merchVariants, merchProducts } from "@/lib/db/schema";

export interface RepricedLine {
  variantId: string;
  printfulVariantId: number;
  printfulSyncVariantId: string;
  productName: string;
  variantName: string;
  size: string | null;
  color: string | null;
  unitPriceCents: number;
  quantity: number;
}

export interface VariantPriceRow {
  id: string;
  printfulVariantId: number;
  printfulSyncVariantId: string;
  variantName: string;
  size: string | null;
  color: string | null;
  retailPriceCents: number;
  productName: string;
}

/** Pure: match requested (variantId, quantity) items to fetched rows.
 * Dedup-safe — the same variantId may appear in multiple requested lines. */
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
      printfulVariantId: r.printfulVariantId,
      printfulSyncVariantId: r.printfulSyncVariantId,
      productName: r.productName,
      variantName: r.variantName,
      size: r.size,
      color: r.color,
      unitPriceCents: r.retailPriceCents,
      quantity: it.quantity,
    });
  }
  return { ok: true, lines };
}

/** Fetch active variants of active products in the org and reprice the
 * requested items server-side (never trusts client prices). Dedups ids. */
export async function repriceCartItems(
  orgId: string,
  items: { variantId: string; quantity: number }[],
): Promise<{ ok: true; lines: RepricedLine[] } | { ok: false }> {
  const ids = [...new Set(items.map((i) => i.variantId))];
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
    })
    .from(merchVariants)
    .innerJoin(merchProducts, eq(merchVariants.productId, merchProducts.id))
    .where(
      and(
        inArray(merchVariants.id, ids),
        eq(merchVariants.active, true),
        eq(merchProducts.active, true),
        eq(merchProducts.organizationId, orgId),
      ),
    );
  return matchRequestedToRows(items, rows);
}
