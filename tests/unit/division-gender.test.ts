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

import {
  ADULT_GENDERS,
  ADULT_LEVELS,
  YOUTH_GENDERS,
  YOUTH_LEVELS,
  DIVISION_LEVELS,
  genderOptionsFor,
  levelOptionsFor,
  skillLevelBadge,
} from "@/lib/leagues/division-filters";
import { audienceForProgram } from "@/lib/programs/derive";

describe("audienceForProgram", () => {
  it("treats both adult spellings as adult", () => {
    expect(audienceForProgram("adults")).toBe("adult");
    expect(audienceForProgram("adult")).toBe("adult");
  });

  it("treats the parents default and anything unknown as youth", () => {
    expect(audienceForProgram("parents")).toBe("youth");
    expect(audienceForProgram("")).toBe("youth");
    expect(audienceForProgram(null)).toBe("youth");
    expect(audienceForProgram(undefined)).toBe("youth");
    expect(audienceForProgram("families")).toBe("youth");
  });
});

describe("vocabulary lists", () => {
  it("keeps the level lists fully disjoint", () => {
    const overlap = ADULT_LEVELS.filter((l) => (YOUTH_LEVELS as readonly string[]).includes(l));
    expect(overlap).toEqual([]);
  });

  it("shares only coed between the gender lists", () => {
    const overlap = ADULT_GENDERS.filter((g) => (YOUTH_GENDERS as readonly string[]).includes(g));
    expect(overlap).toEqual(["coed"]);
  });

  it("fits every level inside varchar(16)", () => {
    for (const l of DIVISION_LEVELS) expect(l.length).toBeLessThanOrEqual(16);
  });

  it("has no bare competitive value", () => {
    expect(DIVISION_LEVELS).not.toContain("competitive");
  });
});

describe("levelOptionsFor", () => {
  it("offers the youth tiers to a youth season", () => {
    expect(levelOptionsFor("youth").map((o) => o.value)).toEqual([
      "competitive_a", "competitive_b", "developmental", "recreational",
    ]);
  });

  it("offers the adult ladder to an adult season", () => {
    expect(levelOptionsFor("adult").map((o) => o.value)).toEqual(["a", "b", "c", "d", "open"]);
  });

  it("appends a stored value from the other vocabulary, marked", () => {
    const opts = levelOptionsFor("youth", "b");
    expect(opts.map((o) => o.value)).toContain("b");
    expect(opts.find((o) => o.value === "b")?.label).toBe("Adult tier: B · Competitive");
  });

  it("does not duplicate a stored value that already belongs", () => {
    const opts = levelOptionsFor("youth", "developmental");
    expect(opts.filter((o) => o.value === "developmental")).toHaveLength(1);
    expect(opts.find((o) => o.value === "developmental")?.label).toBe("Developmental");
  });

  it("ignores an empty stored value", () => {
    expect(levelOptionsFor("youth", "")).toHaveLength(4);
    expect(levelOptionsFor("youth", null)).toHaveLength(4);
  });

  it("preserves an unrecognised stored value rather than dropping it", () => {
    const opts = levelOptionsFor("youth", "legacy_tier");
    expect(opts.find((o) => o.value === "legacy_tier")?.label).toBe("Adult tier: legacy_tier");
  });
});

describe("genderOptionsFor", () => {
  it("offers boys and girls to a youth season", () => {
    expect(genderOptionsFor("youth").map((o) => o.value)).toEqual(["coed", "boys", "girls"]);
  });

  it("offers mens and womens to an adult season", () => {
    expect(genderOptionsFor("adult").map((o) => o.value)).toEqual(["coed", "mens", "womens"]);
  });

  it("marks a stored adult gender on a youth season", () => {
    expect(genderOptionsFor("youth", "mens").find((o) => o.value === "mens")?.label)
      .toBe("Adult tier: Men's");
  });

  it("does not mark coed, which belongs to both", () => {
    const opts = genderOptionsFor("youth", "coed");
    expect(opts).toHaveLength(3);
    expect(opts.find((o) => o.value === "coed")?.label).toBe("Coed");
  });
});

describe("skillLevelBadge", () => {
  it("keeps the adult Tier X treatment", () => {
    expect(skillLevelBadge("b")).toBe("Tier B");
    expect(skillLevelBadge("open")).toBe("Tier OPEN");
  });

  it("renders youth tiers as words, no Tier prefix, no shouting", () => {
    expect(skillLevelBadge("developmental")).toBe("Developmental");
    expect(skillLevelBadge("competitive_a")).toBe("Competitive A");
  });

  it("renders nothing for an unset level", () => {
    expect(skillLevelBadge(null)).toBe("");
    expect(skillLevelBadge("")).toBe("");
  });

  it("echoes an unrecognised value instead of guessing", () => {
    expect(skillLevelBadge("legacy_tier")).toBe("legacy_tier");
  });
});

describe("seasonSchema skillLevel", () => {
  for (const level of DIVISION_LEVELS) {
    it(`accepts "${level}"`, () => {
      expect(seasonSchema.safeParse({ ...base, skillLevel: level }).success).toBe(true);
    });
  }

  it("rejects an unknown level", () => {
    expect(seasonSchema.safeParse({ ...base, skillLevel: "elite" }).success).toBe(false);
  });

  it("does not reject an adult level on a season (no audience cross-check)", () => {
    // A youth season holding a preserved adult tier must stay saveable —
    // otherwise opening it to edit the price 400s on an unrelated field.
    expect(seasonSchema.safeParse({ ...base, skillLevel: "b" }).success).toBe(true);
  });
});
