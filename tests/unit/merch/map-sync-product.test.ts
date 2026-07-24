import { describe, it, expect } from "vitest";
import {
  parseVariantOptions,
  retailPriceToCents,
  slugifyName,
  mapSyncProductDetail,
} from "@/lib/merch/map-sync-product";
import type { PrintfulSyncProductDetail } from "@/lib/printful/types";

describe("retailPriceToCents", () => {
  it("converts a decimal string to integer cents", () => {
    expect(retailPriceToCents("25.00")).toBe(2500);
    expect(retailPriceToCents("9.99")).toBe(999);
  });
  it("throws on an unparseable price", () => {
    expect(() => retailPriceToCents("free")).toThrow();
  });
});

describe("slugifyName", () => {
  it("lowercases, hyphenates, strips punctuation", () => {
    expect(slugifyName("Aspire Staple Tee!")).toBe("aspire-staple-tee");
  });
});

describe("parseVariantOptions", () => {
  it("pulls color + size from a 'Name / Color / Size' variant name", () => {
    expect(parseVariantOptions("Unisex Staple Tee / Black / M")).toEqual({
      color: "Black",
      size: "M",
    });
  });
  it("treats a single trailing segment as size when there is no color", () => {
    expect(parseVariantOptions("Snapback / One size")).toEqual({
      color: null,
      size: "One size",
    });
  });
  it("returns nulls when the name has no separators", () => {
    expect(parseVariantOptions("Sticker Pack")).toEqual({ color: null, size: null });
  });
});

describe("mapSyncProductDetail", () => {
  const detail: PrintfulSyncProductDetail = {
    sync_product: {
      id: 111,
      external_id: "ext-1",
      name: "Aspire Staple Tee",
      thumbnail_url: "https://cdn.printful/thumb.png",
    },
    sync_variants: [
      {
        id: 501,
        external_id: "ext-501",
        sync_product_id: 111,
        name: "Aspire Staple Tee / Black / M",
        synced: true,
        variant_id: 4012,
        retail_price: "25.00",
        sku: "TEE-BLK-M",
        currency: "USD",
        files: [{ type: "preview", preview_url: "https://cdn.printful/blk-m.png" }],
      },
      {
        id: 502,
        external_id: "ext-502",
        sync_product_id: 111,
        name: "Aspire Staple Tee / Black / L",
        synced: true,
        variant_id: 4013,
        retail_price: "25.00",
        sku: "TEE-BLK-L",
        currency: "USD",
        files: [{ type: "preview", preview_url: "https://cdn.printful/blk-m.png" }],
      },
    ],
  };

  it("maps product identity, slug, and deduped images", () => {
    const m = mapSyncProductDetail(detail);
    expect(m.printfulSyncProductId).toBe("111");
    expect(m.name).toBe("Aspire Staple Tee");
    expect(m.baseSlug).toBe("aspire-staple-tee");
    // thumbnail + one deduped preview (both variants share the same preview url)
    expect(m.images.map((i) => i.url)).toEqual([
      "https://cdn.printful/thumb.png",
      "https://cdn.printful/blk-m.png",
    ]);
  });

  it("maps each variant with cents, parsed options, and catalog id", () => {
    const m = mapSyncProductDetail(detail);
    expect(m.variants).toHaveLength(2);
    expect(m.variants[0]).toMatchObject({
      printfulSyncVariantId: "501",
      printfulVariantId: 4012,
      size: "M",
      color: "Black",
      sku: "TEE-BLK-M",
      retailPriceCents: 2500,
    });
  });
});
