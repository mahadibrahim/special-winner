import { describe, it, expect } from "vitest";
import {
  checkAgeEligibility,
  ageOnDate,
  formatAgeIneligibleMessage,
} from "@/lib/registrations/age-eligibility";

describe("ageOnDate", () => {
  it("returns the correct age on an exact birthday", () => {
    // Born 2015-06-15, checking on 2025-06-15 → age 10
    const onDate = new Date("2025-06-15T00:00:00Z");
    expect(ageOnDate("2015-06-15", onDate)).toBe(10);
  });

  it("returns the previous age one day before birthday", () => {
    // Born 2015-06-15, checking on 2025-06-14 → age 9
    const onDate = new Date("2025-06-14T00:00:00Z");
    expect(ageOnDate("2015-06-15", onDate)).toBe(9);
  });

  it("returns the correct age after birthday", () => {
    // Born 2015-06-15, checking on 2025-06-16 → age 10
    const onDate = new Date("2025-06-16T00:00:00Z");
    expect(ageOnDate("2015-06-15", onDate)).toBe(10);
  });

  it("handles birthday in December and January", () => {
    // Born 2015-12-31, checking on 2026-01-01 → age 10
    const onDate = new Date("2026-01-01T00:00:00Z");
    expect(ageOnDate("2015-12-31", onDate)).toBe(10);
  });

  it("handles year boundary correctly", () => {
    // Born 2015-12-31, checking on 2025-12-30 → age 9
    const onDate = new Date("2025-12-30T00:00:00Z");
    expect(ageOnDate("2015-12-31", onDate)).toBe(9);
  });

  it("handles leap year birthdays", () => {
    // Born 2020-02-29, checking on 2025-02-28 → age 4
    const onDate = new Date("2025-02-28T00:00:00Z");
    expect(ageOnDate("2020-02-29", onDate)).toBe(4);
  });

  it("handles leap year birthdays on their birthday year", () => {
    // Born 2020-02-29, checking on 2024-02-29 → age 4
    const onDate = new Date("2024-02-29T00:00:00Z");
    expect(ageOnDate("2020-02-29", onDate)).toBe(4);
  });
});

describe("checkAgeEligibility", () => {
  const onDate = new Date("2025-06-15T00:00:00Z");

  describe("minAge boundary cases", () => {
    it("is eligible when turning minAge on the eligibility date", () => {
      // Born 2015-06-15, minAge 10, checking 2025-06-15 → eligible
      const result = checkAgeEligibility({
        birthDate: "2015-06-15",
        minAge: 10,
        maxAge: null,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });

    it("is too_young one day before turning minAge", () => {
      // Born 2015-06-16, minAge 10, checking 2025-06-15 → too_young (age 9)
      const result = checkAgeEligibility({
        birthDate: "2015-06-16",
        minAge: 10,
        maxAge: null,
        onDate,
      });
      expect(result).toEqual({ eligible: false, reason: "too_young", age: 9 });
    });

    it("is eligible well above minAge", () => {
      // Born 2010-06-15, minAge 10, checking 2025-06-15 → eligible (age 15)
      const result = checkAgeEligibility({
        birthDate: "2010-06-15",
        minAge: 10,
        maxAge: null,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });
  });

  describe("maxAge boundary cases", () => {
    it("is eligible at exact maxAge on the eligibility date", () => {
      // Born 2015-06-15, maxAge 10, checking 2025-06-15 → eligible (age 10)
      const result = checkAgeEligibility({
        birthDate: "2015-06-15",
        minAge: null,
        maxAge: 10,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });

    it("is too_old one day after turning maxAge", () => {
      // Born 2014-06-14, maxAge 10, on 2025-06-15 → age 11 (too_old)
      const result = checkAgeEligibility({
        birthDate: "2014-06-14",
        minAge: null,
        maxAge: 10,
        onDate,
      });
      expect(result).toEqual({ eligible: false, reason: "too_old", age: 11 });
    });

    it("is eligible well below maxAge", () => {
      // Born 2020-06-15, maxAge 10, checking 2025-06-15 → eligible (age 5)
      const result = checkAgeEligibility({
        birthDate: "2020-06-15",
        minAge: null,
        maxAge: 10,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });
  });

  describe("both minAge and maxAge", () => {
    it("is eligible within the range", () => {
      // Born 2012-06-15, minAge 8, maxAge 15, checking 2025-06-15 → eligible (age 13)
      const result = checkAgeEligibility({
        birthDate: "2012-06-15",
        minAge: 8,
        maxAge: 15,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });

    it("is too_young below the range", () => {
      // Born 2016-06-15, minAge 8, maxAge 15, checking 2025-06-15 → too_young (age 9, but only 8 turns on this date, so age 9 > minAge 8... wait)
      // Let me recalculate: born 2016-06-15, on 2025-06-15 is age 9, which is > minAge 8, so eligible
      // Born 2017-06-15, on 2025-06-15 is age 8, which is exactly minAge 8, so eligible
      // Born 2017-06-16, on 2025-06-15 is age 7, which is < minAge 8, so too_young
      const result = checkAgeEligibility({
        birthDate: "2017-06-16",
        minAge: 8,
        maxAge: 15,
        onDate,
      });
      expect(result).toEqual({ eligible: false, reason: "too_young", age: 7 });
    });

    it("is too_old above the range", () => {
      // Born 2009-06-15, minAge 8, maxAge 15, checking 2025-06-15 → too_old (age 16)
      const result = checkAgeEligibility({
        birthDate: "2009-06-15",
        minAge: 8,
        maxAge: 15,
        onDate,
      });
      expect(result).toEqual({ eligible: false, reason: "too_old", age: 16 });
    });

    it("is eligible at exact minAge with maxAge set", () => {
      // Born 2017-06-15, minAge 8, maxAge 15, checking 2025-06-15 → eligible (age 8)
      const result = checkAgeEligibility({
        birthDate: "2017-06-15",
        minAge: 8,
        maxAge: 15,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });

    it("is eligible at exact maxAge with minAge set", () => {
      // Born 2010-06-15, minAge 8, maxAge 15, checking 2025-06-15 → eligible (age 15)
      const result = checkAgeEligibility({
        birthDate: "2010-06-15",
        minAge: 8,
        maxAge: 15,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });
  });

  describe("null age gates", () => {
    it("ignores minAge when null", () => {
      // Born 2020-06-15, minAge null, maxAge 10, checking 2025-06-15 → eligible (age 5)
      const result = checkAgeEligibility({
        birthDate: "2020-06-15",
        minAge: null,
        maxAge: 10,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });

    it("ignores maxAge when null", () => {
      // Born 2010-06-15, minAge 10, maxAge null, checking 2025-06-15 → eligible (age 15)
      const result = checkAgeEligibility({
        birthDate: "2010-06-15",
        minAge: 10,
        maxAge: null,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });

    it("is always eligible when both are null", () => {
      // Born any date, minAge null, maxAge null → always eligible
      const result = checkAgeEligibility({
        birthDate: "2005-06-15",
        minAge: null,
        maxAge: null,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });
  });

  describe("invalid birthDate handling", () => {
    it("returns eligible: true for empty birthDate string", () => {
      // Let zod handle format validation; return eligible:true
      const result = checkAgeEligibility({
        birthDate: "",
        minAge: 8,
        maxAge: 15,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });

    it("returns eligible: true for malformed birthDate", () => {
      // Let zod handle format validation; return eligible:true
      const result = checkAgeEligibility({
        birthDate: "invalid-date",
        minAge: 8,
        maxAge: 15,
        onDate,
      });
      expect(result).toEqual({ eligible: true });
    });
  });
});

describe("formatAgeIneligibleMessage", () => {
  it("formats a min+max range with the exact audit F1 copy", () => {
    const message = formatAgeIneligibleMessage({
      ageGroupName: "U8",
      minAge: 6,
      maxAge: 8,
      age: 10,
      personName: "Sam",
    });
    expect(message).toBe(
      "U8 is for ages 6–8. Sam would be 10 when the season starts — think this is wrong? Contact us at hello@aspiresportsohio.com.",
    );
  });

  it("falls back to \"This player\" when personName is blank/undefined", () => {
    expect(
      formatAgeIneligibleMessage({
        ageGroupName: "U8",
        minAge: 6,
        maxAge: 8,
        age: 10,
        personName: "",
      }),
    ).toContain("This player would be 10");
    expect(
      formatAgeIneligibleMessage({
        ageGroupName: "U8",
        minAge: 6,
        maxAge: 8,
        age: 10,
      }),
    ).toContain("This player would be 10");
  });

  it("degrades to a min-only range (\"ages N+\") when maxAge is null", () => {
    const message = formatAgeIneligibleMessage({
      ageGroupName: "Adult League",
      minAge: 18,
      maxAge: null,
      age: 15,
      personName: "Jamie",
    });
    expect(message).toContain("Adult League is for ages 18+.");
  });

  it("degrades to a max-only range (\"up to N\") when minAge is null", () => {
    const message = formatAgeIneligibleMessage({
      ageGroupName: "U8",
      minAge: null,
      maxAge: 8,
      age: 11,
      personName: "Jamie",
    });
    expect(message).toContain("U8 is for up to 8.");
  });
});
