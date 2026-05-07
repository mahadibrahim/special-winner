import { describe, it, expect } from "vitest";
import { checkMembersOnly, checkCapacity, checkGenderCap } from "@/lib/dropin/gates";

describe("checkMembersOnly", () => {
  it("passes when session is open", () => {
    expect(checkMembersOnly({ membersOnly: false }, null).ok).toBe(true);
  });
  it("passes when session members_only and user has membership", () => {
    expect(checkMembersOnly({ membersOnly: true }, { id: "m1" }).ok).toBe(true);
  });
  it("fails when session members_only and user has no membership", () => {
    const r = checkMembersOnly({ membersOnly: true }, null);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("members_only");
    }
  });
});

describe("checkCapacity", () => {
  it("passes when below capacity", () => {
    expect(checkCapacity({ capacity: 16 }, 12).ok).toBe(true);
  });
  it("fails when at capacity", () => {
    const r = checkCapacity({ capacity: 16 }, 16);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("session_full");
    }
  });
});

describe("checkGenderCap", () => {
  const session = { capacityMale: 8, capacityFemale: 8 };
  it("passes when male under male-cap", () => {
    expect(checkGenderCap(session, "male", { male: 7, female: 5 }).ok).toBe(true);
  });
  it("fails when male at male-cap", () => {
    const r = checkGenderCap(session, "male", { male: 8, female: 5 });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("gender_cap_full");
    }
  });
  it("non-binary user falls back to general capacity (returns ok=true here, capacity gate handled separately)", () => {
    expect(
      checkGenderCap(session, "non_binary", { male: 8, female: 8 }).ok,
    ).toBe(true);
  });
  it("returns ok=true when caps are not configured", () => {
    expect(
      checkGenderCap(
        { capacityMale: null, capacityFemale: null },
        "male",
        { male: 8, female: 8 },
      ).ok,
    ).toBe(true);
  });
});
