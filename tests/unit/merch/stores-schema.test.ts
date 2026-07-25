import { describe, it, expect } from "vitest";
import { merchStores, merchStoreScopeEnum, merchStoreVisibilityEnum, merchProductSourceEnum } from "@/lib/db/schema/merch-stores";

describe("merch-stores schema", () => {
  it("exposes scope + visibility + source enum values", () => {
    expect(merchStoreScopeEnum.enumValues).toEqual(["general", "league", "team"]);
    expect(merchStoreVisibilityEnum.enumValues).toEqual(["public", "unlisted"]);
    expect(merchProductSourceEnum.enumValues).toEqual(["printful", "manual"]);
  });
  it("defines the merch_stores table with the expected columns", () => {
    const cols = Object.keys(merchStores);
    for (const c of ["id","organizationId","scope","teamId","name","slug","visibility","shareToken","orderOpensAt","orderClosesAt","pickupLocation","active","sortOrder"]) {
      expect(cols).toContain(c);
    }
  });
});
