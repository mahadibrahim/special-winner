import { describe, it, expect } from "vitest";
import { derivePersonType } from "@/lib/person/derive-person-type";

describe("derivePersonType", () => {
  it("classifies a users record as a parent/account", () => {
    expect(derivePersonType(null, true)).toBe("parent");
  });
  it("classifies a family_member with a parent as a child", () => {
    expect(derivePersonType({ parentUserId: "u1", selfUserId: null }, false)).toBe("child");
  });
  it("classifies a self-linked family_member as an adult", () => {
    expect(derivePersonType({ parentUserId: null, selfUserId: "u2" }, false)).toBe("adult");
  });
});
