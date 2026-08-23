import { describe, it, expect } from "vitest";
import { isSiblingEligible } from "@/lib/memberships/sibling-discount";

describe("isSiblingEligible", () => {
  it("eligible when another child of the same user holds a live membership", () => {
    expect(
      isSiblingEligible(
        [{ familyMemberId: "kid-a", status: "active" }],
        "kid-b",
      ),
    ).toBe(true);
  });
  it("not eligible for the same child (re-subscribe) or with no existing rows", () => {
    expect(
      isSiblingEligible(
        [{ familyMemberId: "kid-b", status: "active" }],
        "kid-b",
      ),
    ).toBe(false);
    expect(isSiblingEligible([], "kid-b")).toBe(false);
  });
});
