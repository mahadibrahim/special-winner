import { describe, it, expect } from "vitest";
import { venueLocationCondition } from "@/lib/admin/location-scope-filter";

describe("venueLocationCondition", () => {
  it("super-admin (null) → no filter", () => {
    expect(venueLocationCondition(null)).toBeUndefined();
  });
  it("empty locations → a defined (false) condition, not undefined", () => {
    expect(venueLocationCondition([])).toBeDefined();
  });
  it("locations → a defined condition", () => {
    expect(venueLocationCondition(["loc_1"])).toBeDefined();
  });
});
