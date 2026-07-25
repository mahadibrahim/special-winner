import { describe, it, expect } from "vitest";
// NOTE: merch.ts and merch-orders.ts have a pre-existing circular import
// (merch.ts uses merchFulfillmentTypeEnum from merch-orders.ts eagerly at
// module scope; merch-orders.ts imports merchVariants from merch.ts). This
// is order-sensitive: importing "./merch" before "./merch-orders" matches
// the load order the app already uses (schema/index.ts), which resolves
// cleanly. Importing merch-orders first hits a TDZ crash unrelated to the
// schema fields under test here — verified present on unedited code too.
import { merchProducts } from "@/lib/db/schema/merch";
import { merchOrderStatusEnum } from "@/lib/db/schema/merch-orders";

describe("merch order/product schema (3b)", () => {
  it("order status enum includes pickup states", () => {
    expect(merchOrderStatusEnum.enumValues).toEqual(
      ["pending","paid","submitted","shipped","cancelled","failed","awaiting_pickup","collected"],
    );
  });
  it("products carry store_id", () => {
    expect(Object.keys(merchProducts)).toContain("storeId");
  });
});
