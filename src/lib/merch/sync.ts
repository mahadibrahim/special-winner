import { getDb } from "@/lib/db";
import { and, eq, notInArray } from "drizzle-orm";
import { merchProducts, merchVariants } from "@/lib/db/schema";
import { listStoreProducts, getSyncProduct } from "@/lib/printful/client";
import {
  mapSyncProductDetail,
  type MappedMerchProduct,
} from "@/lib/merch/map-sync-product";
import { ensureGeneralStore } from "@/lib/merch/stores";

export interface SyncResult {
  products: number;
  variants: number;
  deactivated: number;
}

/** Make slugs unique + order-preserving; empty base → "item". */
export function dedupeSlugs(items: { baseSlug: string }[]): string[] {
  const used = new Set<string>();
  return items.map(({ baseSlug }) => {
    const base = baseSlug || "item";
    let candidate = base;
    let n = 1;
    while (used.has(candidate)) {
      n += 1;
      candidate = `${base}-${n}`;
    }
    used.add(candidate);
    return candidate;
  });
}

/**
 * Pull every synced product from Printful and upsert it (and its variants)
 * into this org's merch catalog. Products no longer present in Printful are
 * deactivated (never deleted — keeps historical order references intact for
 * Phase 2). Idempotent: safe to re-run.
 */
export async function syncMerchCatalog(orgId: string, orgName: string): Promise<SyncResult> {
  const db = getDb();
  const store = await ensureGeneralStore(orgId, orgName);

  const summaries = await listStoreProducts();
  const mapped: MappedMerchProduct[] = [];
  for (const s of summaries) {
    const detail = await getSyncProduct(s.id);
    mapped.push(mapSyncProductDetail(detail));
  }

  const slugs = dedupeSlugs(mapped);
  let variantCount = 0;
  const seenSyncProductIds: string[] = [];

  for (let i = 0; i < mapped.length; i++) {
    const m = mapped[i];
    seenSyncProductIds.push(m.printfulSyncProductId);

    const [product] = await db
      .insert(merchProducts)
      .values({
        organizationId: orgId,
        storeId: store.id,
        printfulSyncProductId: m.printfulSyncProductId,
        name: m.name,
        slug: slugs[i],
        images: m.images,
        active: true,
        syncedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [merchProducts.organizationId, merchProducts.printfulSyncProductId],
        set: {
          name: m.name,
          slug: slugs[i],
          images: m.images,
          active: true,
          syncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning({ id: merchProducts.id });

    const seenSyncVariantIds: string[] = [];
    for (const v of m.variants) {
      seenSyncVariantIds.push(v.printfulSyncVariantId);
      await db
        .insert(merchVariants)
        .values({
          productId: product.id,
          printfulSyncVariantId: v.printfulSyncVariantId,
          printfulVariantId: v.printfulVariantId,
          name: v.name,
          size: v.size,
          color: v.color,
          sku: v.sku,
          retailPriceCents: v.retailPriceCents,
          active: true,
        })
        .onConflictDoUpdate({
          target: merchVariants.printfulSyncVariantId,
          set: {
            productId: product.id,
            printfulVariantId: v.printfulVariantId,
            name: v.name,
            size: v.size,
            color: v.color,
            sku: v.sku,
            retailPriceCents: v.retailPriceCents,
            active: true,
            updatedAt: new Date(),
          },
        });
      variantCount++;
    }

    // deactivate variants that vanished from this product in Printful
    if (seenSyncVariantIds.length > 0) {
      await db
        .update(merchVariants)
        .set({ active: false, updatedAt: new Date() })
        .where(
          and(
            eq(merchVariants.productId, product.id),
            notInArray(merchVariants.printfulSyncVariantId, seenSyncVariantIds),
          ),
        );
    }
  }

  // deactivate products removed from Printful entirely
  let deactivated = 0;
  // Guard: only deactivate when Printful returned at least one product. This
  // protects against an erroneously-empty API response wiping the catalog —
  // with the tradeoff that a genuinely-emptied store won't auto-deactivate
  // its last products (an admin can deactivate them directly).
  if (seenSyncProductIds.length > 0) {
    const rows = await db
      .update(merchProducts)
      .set({ active: false, updatedAt: new Date() })
      .where(
        and(
          eq(merchProducts.organizationId, orgId),
          eq(merchProducts.storeId, store.id),
          notInArray(merchProducts.printfulSyncProductId, seenSyncProductIds),
        ),
      )
      .returning({ id: merchProducts.id });
    deactivated = rows.length;
  }

  return { products: mapped.length, variants: variantCount, deactivated };
}
