import { describe, it, expect } from "vitest";
import { pickCheapestRate, parcelForLines } from "@/lib/shipping/rates";
import { mapShippoRates } from "@/lib/shipping/shippo";
describe("pickCheapestRate", () => {
  it("returns the min-cost rate", () => {
    expect(pickCheapestRate([{carrier:"UPS",service:"G",amountCents:1200},{carrier:"USPS",service:"GA",amountCents:800}])?.amountCents).toBe(800);
  });
  it("null on empty", () => expect(pickCheapestRate([])).toBeNull());
});
describe("parcelForLines", () => {
  const line = (weightOz: number|null, qty=1) => ({ weightOz, lengthIn:null, widthIn:null, heightIn:null, quantity:qty, productName:"P" });
  it("sums weight × qty", () => {
    const r = parcelForLines([line(8,2), line(4,1)]);
    expect(r.ok && r.parcel.weightOz).toBe(20);
  });
  it("fails when a line lacks weight", () => {
    const r = parcelForLines([line(null)]);
    expect(r.ok).toBe(false);
  });
});
describe("mapShippoRates", () => {
  it("drops malformed rates and keeps only the valid one", () => {
    const result = mapShippoRates([
      { amount: "8.50", provider: "USPS", servicelevel: { name: "Ground Advantage" }, object_id: "x" },
      { provider: "UPS" },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ amountCents: 850, carrier: "USPS", service: "Ground Advantage", providerRateId: "x" });
  });
  it("returns [] when every rate is malformed", () => {
    expect(mapShippoRates([{ provider: "UPS" }, { amount: "not-a-number" }])).toEqual([]);
  });
});
