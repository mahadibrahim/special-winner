import { describe, it, expect } from "vitest";
// NOTE: merch.ts and merch-orders.ts have a pre-existing circular import
// (see orders-schema.test.ts) — import "./merch" before "./merch-orders" to
// match the load order schema/index.ts already uses.
import { merchProducts } from "@/lib/db/schema/merch";
import { merchOrderItems } from "@/lib/db/schema/merch-orders";
import {
  merchBundles,
  merchBundleItems,
  merchBundleDiscountTypeEnum,
} from "@/lib/db/schema/merch-bundles";

describe("merch-bundles schema", () => {
  it("exposes the discount type enum", () => {
    expect(merchBundleDiscountTypeEnum.enumValues).toEqual(["percent", "fixed"]);
  });

  it("defines the merch_bundles table with the expected columns", () => {
    const cols = Object.keys(merchBundles);
    for (const c of [
      "id",
      "organizationId",
      "storeId",
      "name",
      "slug",
      "description",
      "images",
      "discountType",
      "discountValue",
      "fulfillmentType",
      "active",
      "sortOrder",
      "createdAt",
      "updatedAt",
    ]) {
      expect(cols).toContain(c);
    }
  });

  it("defines the merch_bundle_items table with the expected columns", () => {
    const cols = Object.keys(merchBundleItems);
    for (const c of ["id", "bundleId", "productId", "label", "quantity", "sortOrder"]) {
      expect(cols).toContain(c);
    }
  });

  it("references merchProducts so it stays import-compatible with the catalog schema", () => {
    expect(merchProducts).toBeDefined();
  });

  it("merch_order_items carries bundleId + bundleName snapshot columns", () => {
    const cols = Object.keys(merchOrderItems);
    expect(cols).toContain("bundleId");
    expect(cols).toContain("bundleName");
  });
});
