import { describe, it, expect } from "vitest";
import { resourceDisplayName } from "@/lib/admin/venue-day-data";

describe("resourceDisplayName", () => {
  it("uses the space (venue) name alone when it holds a single field", () => {
    // The 0040 backfill named every inner field "Field 1"; for one-field
    // spaces the space name is the only meaningful label ("Blue Field").
    expect(resourceDisplayName("Blue Field", "Field 1", 1)).toBe("Blue Field");
    expect(resourceDisplayName("Main Field", "Field 1", 1)).toBe("Main Field");
  });

  it("qualifies with the field name when a space holds multiple fields", () => {
    expect(resourceDisplayName("South Hall", "Field 1", 2)).toBe(
      "South Hall · Field 1",
    );
    expect(resourceDisplayName("South Hall", "Field 2", 2)).toBe(
      "South Hall · Field 2",
    );
  });

  it("avoids stuttering when the field name equals the space name", () => {
    expect(resourceDisplayName("Court A", "Court A", 3)).toBe("Court A");
  });
});
