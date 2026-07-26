import { describe, it, expect } from "vitest";
import { pickCheapestRate, parcelForLines } from "@/lib/shipping/rates";
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
