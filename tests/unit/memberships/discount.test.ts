import { describe, expect, it } from "vitest";
import { applyMemberRentalDiscount } from "@/lib/memberships/discount";

describe("applyMemberRentalDiscount", () => {
  it("returns the base amount unchanged when benefits is empty", () => {
    expect(applyMemberRentalDiscount(8000, {})).toBe(8000);
  });

  it("returns the base amount unchanged when rental_discount_pct is missing", () => {
    expect(applyMemberRentalDiscount(8000, { booking_window_days: 14 })).toBe(8000);
  });

  it("returns the base amount unchanged when rental_discount_pct is 0", () => {
    expect(applyMemberRentalDiscount(8000, { rental_discount_pct: 0 })).toBe(8000);
  });

  it("applies a 10% discount and rounds to the nearest cent", () => {
    // 8000 * 0.9 = 7200 — exact
    expect(applyMemberRentalDiscount(8000, { rental_discount_pct: 10 })).toBe(7200);
    // 8001 * 0.9 = 7200.9 → 7201
    expect(applyMemberRentalDiscount(8001, { rental_discount_pct: 10 })).toBe(7201);
  });

  it("applies a 20% discount", () => {
    expect(applyMemberRentalDiscount(8000, { rental_discount_pct: 20 })).toBe(6400);
  });

  it("clamps at 100% so the discounted amount cannot go negative", () => {
    expect(applyMemberRentalDiscount(8000, { rental_discount_pct: 150 })).toBe(0);
  });

  it("treats negative pct as 0 (no discount)", () => {
    expect(applyMemberRentalDiscount(8000, { rental_discount_pct: -10 })).toBe(8000);
  });

  it("returns 0 for a 0-cent base regardless of pct", () => {
    expect(applyMemberRentalDiscount(0, { rental_discount_pct: 50 })).toBe(0);
  });
});
