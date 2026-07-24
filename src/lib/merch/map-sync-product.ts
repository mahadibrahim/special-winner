import type { PrintfulSyncProductDetail } from "@/lib/printful/types";

export interface MappedMerchVariant {
  printfulSyncVariantId: string;
  printfulVariantId: number;
  name: string;
  size: string | null;
  color: string | null;
  sku: string | null;
  retailPriceCents: number;
}

export interface MappedMerchProduct {
  printfulSyncProductId: string;
  name: string;
  baseSlug: string;
  images: { url: string }[];
  variants: MappedMerchVariant[];
}

export function retailPriceToCents(price: string): number {
  const value = Number.parseFloat(price);
  if (!Number.isFinite(value)) {
    throw new Error(`Unparseable Printful retail_price: ${price}`);
  }
  return Math.round(value * 100);
}

export function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Printful sync-variant names are formatted "Product / Color / Size" (or
 * "Product / Size" for single-option products). We take the last segment as
 * size and the second-to-last as color. Missing separators → nulls.
 */
export function parseVariantOptions(name: string): {
  color: string | null;
  size: string | null;
} {
  const parts = name.split("/").map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) return { color: null, size: null };
  if (parts.length === 2) return { color: null, size: parts[1] };
  return { color: parts[parts.length - 2], size: parts[parts.length - 1] };
}

export function mapSyncProductDetail(
  detail: PrintfulSyncProductDetail,
): MappedMerchProduct {
  const { sync_product, sync_variants } = detail;

  // images: product thumbnail first, then distinct variant previews.
  const urls: string[] = [];
  if (sync_product.thumbnail_url) urls.push(sync_product.thumbnail_url);
  for (const v of sync_variants) {
    const preview = v.files?.find((f) => f.type === "preview")?.preview_url;
    if (preview && !urls.includes(preview)) urls.push(preview);
  }

  const variants: MappedMerchVariant[] = sync_variants.map((v) => {
    const { color, size } = parseVariantOptions(v.name);
    return {
      printfulSyncVariantId: String(v.id),
      printfulVariantId: v.variant_id,
      name: v.name,
      size,
      color,
      sku: v.sku,
      retailPriceCents: retailPriceToCents(v.retail_price),
    };
  });

  return {
    printfulSyncProductId: String(sync_product.id),
    name: sync_product.name,
    baseSlug: slugifyName(sync_product.name),
    images: urls.map((url) => ({ url })),
    variants,
  };
}
