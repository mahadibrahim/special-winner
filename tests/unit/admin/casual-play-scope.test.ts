import { describe, it, expect } from "vitest";
import { venueLocationCondition, locationScopeCondition } from "@/lib/admin/location-scope-filter";
import { locations } from "@/lib/db/schema/organizations";

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

// The generalized helper (reused by nav-badges on locations.id) must enforce
// the same empty-array → "no rows" guard, never "all rows".
describe("locationScopeCondition", () => {
  it("super-admin (null) → no filter", () => {
    expect(locationScopeCondition(locations.id, null)).toBeUndefined();
  });
  it("empty locations → a defined (false) condition, not undefined", () => {
    expect(locationScopeCondition(locations.id, [])).toBeDefined();
  });
  it("locations → a defined condition", () => {
    expect(locationScopeCondition(locations.id, ["loc_1"])).toBeDefined();
  });
});
