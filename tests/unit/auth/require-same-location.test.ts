import { describe, it, expect } from "vitest";
import { requireSameLocation } from "@/lib/auth/require-resource-ownership";

describe("requireSameLocation", () => {
  it("returns ok when locationId is in the allowed set", () => {
    const result = requireSameLocation(["loc-1", "loc-2"], "loc-1");
    expect(result).toEqual({ ok: true, locationId: "loc-1" });
  });

  it("returns 404 when locationId is not in the allowed set", () => {
    const result = requireSameLocation(["loc-1", "loc-2"], "loc-3");
    expect(result).toEqual({ ok: false, status: 404 });
  });

  it("returns 404 when the allowed set is empty", () => {
    const result = requireSameLocation([], "loc-1");
    expect(result).toEqual({ ok: false, status: 404 });
  });
});
