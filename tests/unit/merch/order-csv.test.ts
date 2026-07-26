import { describe, it, expect } from "vitest";
import { buildOrdersCsv } from "@/lib/merch/order-csv";

describe("buildOrdersCsv", () => {
  it("emits a header + one row per item with personalization", () => {
    const csv = buildOrdersCsv([
      { email: "a@x.com", productName: "Jersey", size: "M", personalization: { name: "Lee", number: "10" }, quantity: 1, status: "awaiting_pickup" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("email,product,size,name,number,quantity,status,carrier,service,tracking,bundle");
    expect(lines[1]).toContain("a@x.com");
    expect(lines[1]).toContain("Lee");
    expect(lines[1]).toContain("10");
  });
  it("escapes commas/quotes", () => {
    const csv = buildOrdersCsv([{ email: "b@x.com", productName: "Tee, Big", size: null, personalization: null, quantity: 2, status: "collected" }]);
    expect(csv).toContain('"Tee, Big"');
  });
  it("includes carrier/service/tracking columns for shipped self-shipped orders", () => {
    const csv = buildOrdersCsv([
      {
        email: "c@x.com",
        productName: "Hoodie",
        size: "L",
        personalization: null,
        quantity: 1,
        status: "shipped",
        carrier: "USPS",
        service: "Priority",
        trackingNumber: "9400111899223344556677",
      },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[1]).toContain("USPS");
    expect(lines[1]).toContain("Priority");
    expect(lines[1]).toContain("9400111899223344556677");
  });
  it("populates the bundle column for bundle lines and leaves it blank otherwise", () => {
    const csv = buildOrdersCsv([
      { email: "d@x.com", productName: "Jersey", size: "M", personalization: null, quantity: 1, status: "paid", bundle: "Full Uniform Kit" },
      { email: "d@x.com", productName: "Water bottle", size: null, personalization: null, quantity: 1, status: "paid" },
    ]);
    const lines = csv.trim().split("\n");
    expect(lines[0].split(",")).toContain("bundle");
    expect(lines[1]).toContain("Full Uniform Kit");
    // Non-bundle line: bundle column present but empty (trailing comma before newline).
    expect(lines[2].endsWith(",")).toBe(true);
  });
});
