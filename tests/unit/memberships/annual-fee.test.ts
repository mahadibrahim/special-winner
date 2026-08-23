import { describe, it, expect } from "vitest";
import { nextFeeDueAt } from "@/lib/memberships/annual-fee";

describe("nextFeeDueAt", () => {
  it("advances one calendar year", () => {
    expect(nextFeeDueAt(new Date("2026-09-01T12:00:00Z")).toISOString()).toBe(
      "2027-09-01T12:00:00.000Z",
    );
  });
  it("handles Feb 29 → Feb 28", () => {
    expect(nextFeeDueAt(new Date("2028-02-29T00:00:00Z")).toISOString()).toBe(
      "2029-02-28T00:00:00.000Z",
    );
  });
});
