import { describe, it, expect } from "vitest";
import { buildOrdersCsv } from "@/lib/merch/order-csv";

describe("buildOrdersCsv", () => {
  it("emits a header + one row per item with personalization", () => {
    const csv = buildOrdersCsv([
      { email: "a@x.com", productName: "Jersey", size: "M", personalization: { name: "Lee", number: "10" }, quantity: 1, status: "awaiting_pickup" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("email,product,size,name,number,quantity,status");
    expect(lines[1]).toContain("a@x.com");
    expect(lines[1]).toContain("Lee");
    expect(lines[1]).toContain("10");
  });
  it("escapes commas/quotes", () => {
    const csv = buildOrdersCsv([{ email: "b@x.com", productName: "Tee, Big", size: null, personalization: null, quantity: 2, status: "collected" }]);
    expect(csv).toContain('"Tee, Big"');
  });
});
