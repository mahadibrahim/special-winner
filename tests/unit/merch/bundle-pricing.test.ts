import { describe, it, expect } from "vitest";
import {
  bundleFullCents,
  bundleDiscountedCents,
  distributeBundleDiscount,
} from "@/lib/merch/bundle-pricing";

const C = (unitPriceCents: number, quantity = 1) => ({ unitPriceCents, quantity });

describe("bundleFullCents", () => {
  it("sums unitPriceCents x quantity across components", () => {
    expect(bundleFullCents([C(4500), C(2500, 2)])).toBe(9500);
  });

  it("returns 0 for an empty component list", () => {
    expect(bundleFullCents([])).toBe(0);
  });

  it("handles a single component with quantity 1", () => {
    expect(bundleFullCents([C(1999)])).toBe(1999);
  });
});

describe("bundleDiscountedCents", () => {
  it("rounds percent discounts (9500 @ 10% -> 8550)", () => {
    expect(bundleDiscountedCents(9500, "percent", 10)).toBe(8550);
  });

  it("clamps percent values above 100 to a full (0 cent) charge", () => {
    expect(bundleDiscountedCents(9500, "percent", 150)).toBe(0);
  });

  it("clamps negative percent values to 0% off (full price charged)", () => {
    expect(bundleDiscountedCents(9500, "percent", -50)).toBe(9500);
  });

  it("clamps fixed discounts at 0 when the discount exceeds the full price", () => {
    expect(bundleDiscountedCents(3000, "fixed", 5000)).toBe(0);
  });

  it("applies a fixed discount below the full price directly", () => {
    expect(bundleDiscountedCents(9500, "fixed", 1500)).toBe(8000);
  });

  it("never goes negative on a fixed discount exactly equal to full price", () => {
    expect(bundleDiscountedCents(3000, "fixed", 3000)).toBe(0);
  });

  it("percent 0 leaves the full price unchanged", () => {
    expect(bundleDiscountedCents(9500, "percent", 0)).toBe(9500);
  });

  it("percent 100 zeroes out the price", () => {
    expect(bundleDiscountedCents(9500, "percent", 100)).toBe(0);
  });
});

describe("distributeBundleDiscount", () => {
  it("gives a single component the whole discounted total", () => {
    const parts = distributeBundleDiscount([C(4500)], 4000);
    expect(parts).toEqual([4000]);
  });

  it("returns all zeros when the bundle's full price is zero", () => {
    expect(distributeBundleDiscount([C(0), C(0)], 0)).toEqual([0, 0]);
  });

  it("returns all zeros (matching component count) for a zero-full bundle with more parts", () => {
    expect(distributeBundleDiscount([C(0), C(0), C(0)], 0)).toEqual([0, 0, 0]);
  });

  it("matches a hand-checked 3-component uneven split", () => {
    // full = 4500 + 2500*2 + 1299*3 = 4500 + 5000 + 3897 = 13397
    // 13% off -> discounted = round(13397 * 87 / 100) = round(11655.39) = 11655
    const comps = [C(4500), C(2500, 2), C(1299, 3)];
    const full = bundleFullCents(comps);
    expect(full).toBe(13397);
    const discounted = bundleDiscountedCents(full, "percent", 13);
    expect(discounted).toBe(11655);

    // ideal shares: 4500*11655/13397 = 3914.869...  -> floor 3914, rem .869...
    //               5000*11655/13397 = 4349.854...  -> floor 4349, rem .854...
    //               3897*11655/13397 = 3390.276...  -> floor 3390, rem .276...
    // floor sum = 3914 + 4349 + 3390 = 11653; leftover = 2
    // largest remainders: index0 (.869) then index1 (.854) each get +1
    const parts = distributeBundleDiscount(comps, discounted);
    expect(parts).toEqual([3915, 4350, 3390]);
    expect(parts.reduce((a, b) => a + b, 0)).toBe(discounted);
  });

  it("sums exactly to the discounted total for the brief's fixed 3-component case across repeated calls", () => {
    for (let t = 0; t < 500; t++) {
      const comps2 = [C(4500), C(2500, 2), C(1299, 3)];
      const disc = bundleDiscountedCents(bundleFullCents(comps2), "percent", 13);
      const parts = distributeBundleDiscount(comps2, disc);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(disc);
    }
  });

  it("sums EXACTLY to the discounted total across 500 randomized component sets and discounts", () => {
    let assertions = 0;
    for (let t = 0; t < 500; t++) {
      const numComponents = 1 + Math.floor(Math.random() * 5); // 1..5 components
      const comps = Array.from({ length: numComponents }, () =>
        C(1 + Math.floor(Math.random() * 9999), 1 + Math.floor(Math.random() * 10)),
      );
      const full = bundleFullCents(comps);
      const type: "percent" | "fixed" = Math.random() < 0.5 ? "percent" : "fixed";
      const value =
        type === "percent"
          ? Math.floor(Math.random() * 140) - 20 // includes some out-of-range values
          : Math.floor(Math.random() * (full + 200));

      const discounted = bundleDiscountedCents(full, type, value);
      const parts = distributeBundleDiscount(comps, discounted);

      expect(parts.length).toBe(comps.length);
      expect(parts.every((p) => p >= 0)).toBe(true);
      expect(parts.reduce((a, b) => a + b, 0)).toBe(discounted);
      assertions++;
    }
    expect(assertions).toBe(500);
  });

  it("never emits a negative component share even with an extreme discount", () => {
    const comps = [C(100), C(1)];
    const parts = distributeBundleDiscount(comps, 0);
    expect(parts).toEqual([0, 0]);
    expect(parts.every((p) => p >= 0)).toBe(true);
  });

  it("preserves input order in the returned array", () => {
    const comps = [C(100), C(9000), C(50)];
    const full = bundleFullCents(comps);
    const parts = distributeBundleDiscount(comps, full);
    // no discount at all -> each part equals its own extended price
    expect(parts).toEqual([100, 9000, 50]);
  });
});
