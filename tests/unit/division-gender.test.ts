import { describe, it, expect } from "vitest";
import { seasonSchema } from "@/pages/api/admin/seasons";
import {
  DIVISION_GENDERS,
  DIVISION_GENDER_LABEL,
  divisionGenderLabel,
} from "@/lib/leagues/division-filters";

const base = {
  programId: "00000000-0000-0000-0000-000000000000",
  name: "Youth Flag Football",
  slug: "youth-flag-football",
  startDate: "2026-09-06",
  endDate: "2026-10-25",
  priceCents: 10500,
};

// divisionGender was originally modelled for adult leagues only (coed/mens/
// womens), which left youth seasons with no way to say "Boys" or "Girls".
describe("seasonSchema divisionGender", () => {
  for (const gender of DIVISION_GENDERS) {
    it(`accepts "${gender}"`, () => {
      const r = seasonSchema.safeParse({ ...base, divisionGender: gender });
      expect(r.success).toBe(true);
    });
  }

  it("still rejects an unknown division gender", () => {
    const r = seasonSchema.safeParse({ ...base, divisionGender: "mixed" });
    expect(r.success).toBe(false);
  });

  it("still allows omitting the division gender", () => {
    expect(seasonSchema.safeParse(base).success).toBe(true);
    expect(seasonSchema.safeParse({ ...base, divisionGender: null }).success).toBe(true);
  });

  it("fits every value inside the varchar(10) division_gender column", () => {
    for (const gender of DIVISION_GENDERS) {
      expect(gender.length).toBeLessThanOrEqual(10);
    }
  });
});

describe("divisionGenderLabel", () => {
  it("labels the youth values as Boys/Girls, not Coed", () => {
    expect(divisionGenderLabel("boys")).toBe("Boys");
    expect(divisionGenderLabel("girls")).toBe("Girls");
  });

  it("keeps the adult labels unchanged", () => {
    expect(divisionGenderLabel("coed")).toBe("Coed");
    expect(divisionGenderLabel("mens")).toBe("Men's");
    expect(divisionGenderLabel("womens")).toBe("Women's");
  });

  it("echoes an unknown value rather than mislabelling it", () => {
    expect(divisionGenderLabel("mixed")).toBe("mixed");
  });

  it("has a label for every supported value", () => {
    for (const gender of DIVISION_GENDERS) {
      expect(DIVISION_GENDER_LABEL[gender]).toBeTruthy();
    }
  });
});
