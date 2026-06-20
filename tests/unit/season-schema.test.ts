import { describe, it, expect } from "vitest";
import { seasonSchema } from "@/pages/api/admin/seasons";

const base = {
  programId: "00000000-0000-0000-0000-000000000000",
  name: "Summer Camp",
  slug: "summer-camp",
  startDate: "2026-07-06",
  endDate: "2026-07-10",
  priceCents: 37500,
};

describe("seasonSchema camp fields", () => {
  it("accepts half-day price and an age range", () => {
    const r = seasonSchema.safeParse({ ...base, halfDayPriceCents: 20000, minAge: 5, maxAge: 12 });
    expect(r.success).toBe(true);
  });

  it("rejects maxAge below minAge", () => {
    const r = seasonSchema.safeParse({ ...base, minAge: 12, maxAge: 5 });
    expect(r.success).toBe(false);
  });

  it("still accepts a season with no camp fields (league)", () => {
    const r = seasonSchema.safeParse(base);
    expect(r.success).toBe(true);
  });
});
