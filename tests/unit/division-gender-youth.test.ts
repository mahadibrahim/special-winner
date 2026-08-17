// Regression coverage for the youth-term-page review finding: a "girls"
// division was rendered labelled "Coed" (divisions-finder.tsx's old inline
// ternary only recognized mens/womens) while its real gender value was
// "girls" — so clicking the (mislabeled) Coed chip hid the row it had just
// labelled Coed, and clicking Girls (once added) wouldn't have matched it
// either, because nothing produced a "girls" DivisionGender in the first
// place (the youth term page force-cast divisionGender straight into the
// coed|mens|womens union). This file locks in: the label is correct, the
// filter's own chip matches the row, and a mismatched chip does not.
import { describe, it, expect } from "vitest";
import { filterDivisions, toDivisionGender, type Division, type DivisionFilters } from "@/lib/leagues/division-filters";
import { GENDER_LABEL } from "@/components/leagues/divisions-finder";

const D = (over: Partial<Division>): Division => ({
  id: "x", name: "U10 Girls", level: "open", gender: "girls", day: "sat",
  venueSlug: "worthington", venueName: "Worthington", time: "9–10 AM",
  status: "open", spotsLabel: "open", seasonId: "s1", signupModes: ["individual"],
  ...over,
});

const EMPTY: DivisionFilters = { level: null, gender: null, day: null, venue: null };

describe("youth division gender — label + filter alignment", () => {
  it("toDivisionGender narrows real youth values instead of defaulting them away", () => {
    expect(toDivisionGender("girls")).toBe("girls");
    expect(toDivisionGender("boys")).toBe("boys");
  });

  it("toDivisionGender falls back to coed for null/unknown, same as the old cast's default", () => {
    expect(toDivisionGender(null)).toBe("coed");
    expect(toDivisionGender(undefined)).toBe("coed");
    expect(toDivisionGender("garbage")).toBe("coed");
  });

  it("GENDER_LABEL renders a girls division as 'Girls', not 'Coed'", () => {
    expect(GENDER_LABEL.girls).toBe("Girls");
    expect(GENDER_LABEL.boys).toBe("Boys");
    // Full coverage — every DivisionGender key must map to a label so a
    // future added gender value can't silently fall through again.
    expect(GENDER_LABEL).toEqual({ coed: "Coed", mens: "Men's", womens: "Women's", boys: "Boys", girls: "Girls" });
  });

  it("a girls division is matched (not hidden) by its own filter chip", () => {
    const rows = [D({ id: "girls-1", gender: "girls" }), D({ id: "coed-1", gender: "coed" })];
    const ids = filterDivisions(rows, { ...EMPTY, gender: "girls" }).map((d) => d.id);
    expect(ids).toEqual(["girls-1"]);
  });

  it("a girls division does NOT show up under the Coed chip (the old mislabel would have)", () => {
    const rows = [D({ id: "girls-1", gender: "girls" }), D({ id: "coed-1", gender: "coed" })];
    const ids = filterDivisions(rows, { ...EMPTY, gender: "coed" }).map((d) => d.id);
    expect(ids).toEqual(["coed-1"]);
  });
});
