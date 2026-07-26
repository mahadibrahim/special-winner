import { describe, it, expect } from "vitest";
// NOTE: merch.ts and merch-orders.ts have a pre-existing circular import
// (see orders-schema.test.ts) — import "./merch" before "./merch-orders" to
// match the load order schema/index.ts already uses.
import { merchProducts } from "@/lib/db/schema/merch";
import { merchOrderStatusEnum } from "@/lib/db/schema/merch-orders";
import { merchDownloadGrants } from "@/lib/db/schema/merch-downloads";

describe("digital goods schema", () => {
  it("merch_products carries digital asset columns", () => {
    const cols = Object.keys(merchProducts);
    expect(cols).toContain("digitalAssetKey");
    expect(cols).toContain("digitalAssetName");
  });

  it("defines the merch_download_grants table with the expected columns", () => {
    const cols = Object.keys(merchDownloadGrants);
    for (const c of [
      "id",
      "orderItemId",
      "token",
      "assetKey",
      "assetName",
      "expiresAt",
      "downloadCount",
      "createdAt",
    ]) {
      expect(cols).toContain(c);
    }
  });

  it("merch_order_status enum ends with delivered", () => {
    const values = merchOrderStatusEnum.enumValues;
    expect(values[values.length - 1]).toBe("delivered");
  });
});
