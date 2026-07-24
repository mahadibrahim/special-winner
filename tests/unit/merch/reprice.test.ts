import { describe, it, expect } from "vitest";
import { matchRequestedToRows } from "@/lib/merch/reprice";

const row = {
  id: "v1", printfulVariantId: 4012, printfulSyncVariantId: "501",
  variantName: "Hoodie / M", size: "M", color: null, retailPriceCents: 4650, productName: "Hoodie",
};

describe("matchRequestedToRows", () => {
  it("prices each requested line from the DB row (server price, not client)", () => {
    const r = matchRequestedToRows([{ variantId: "v1", quantity: 2 }], [row]);
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.lines[0].unitPriceCents).toBe(4650); expect(r.lines[0].quantity).toBe(2); }
  });
  it("handles the same variant across two requested lines (no false-negative)", () => {
    const r = matchRequestedToRows([{ variantId: "v1", quantity: 1 }, { variantId: "v1", quantity: 3 }], [row]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.lines).toHaveLength(2);
  });
  it("fails when a requested variant has no matching row", () => {
    expect(matchRequestedToRows([{ variantId: "vX", quantity: 1 }], [row]).ok).toBe(false);
  });
});
