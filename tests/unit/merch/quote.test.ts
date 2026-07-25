import { describe, it, expect } from "vitest";
import { assembleQuote } from "@/lib/merch/quote";

describe("assembleQuote", () => {
  it("sums subtotal and adds shipping", () => {
    const q = assembleQuote(
      [{ unitPriceCents: 4650, quantity: 2 }, { unitPriceCents: 5200, quantity: 1 }],
      599,
    );
    expect(q.subtotalCents).toBe(4650 * 2 + 5200);
    expect(q.shippingCents).toBe(599);
    expect(q.totalBeforeTaxCents).toBe(4650 * 2 + 5200 + 599);
  });
});
