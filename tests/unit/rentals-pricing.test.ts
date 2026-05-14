import { describe, it, expect } from "vitest";
import {
  resolveRentalHourlyRateCents,
  computeRentalPriceCents,
} from "@/lib/rentals/pricing";

describe("resolveRentalHourlyRateCents", () => {
  it("uses the venue override when set", () => {
    expect(resolveRentalHourlyRateCents(12000, 8000)).toBe(12000);
  });
  it("falls back to the rate-card default when the venue override is null", () => {
    expect(resolveRentalHourlyRateCents(null, 8000)).toBe(8000);
  });
});

describe("computeRentalPriceCents", () => {
  const start = new Date("2026-06-01T18:00:00Z");
  it("charges per hour for a whole-hour block", () => {
    const end = new Date("2026-06-01T20:00:00Z");
    expect(computeRentalPriceCents(start, end, 8000)).toBe(16000);
  });
  it("prorates a 90-minute block", () => {
    const end = new Date("2026-06-01T19:30:00Z");
    expect(computeRentalPriceCents(start, end, 8000)).toBe(12000);
  });
  it("returns 0 when end is not after start", () => {
    expect(computeRentalPriceCents(start, start, 8000)).toBe(0);
  });
});
