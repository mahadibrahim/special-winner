import { describe, it, expect } from "vitest";
import { filterDivisions, type Division, type DivisionFilters } from "@/lib/leagues/division-filters";

const D = (over: Partial<Division>): Division => ({
  id: "x", name: "Coed C", level: "c", gender: "coed", day: "tue",
  venueSlug: "worthington", venueName: "Worthington", time: "6–8 PM",
  status: "open", spotsLabel: "open", seasonId: "s1", signupModes: ["individual", "team"],
  ...over,
});

const ALL: Division[] = [
  D({ id: "1", level: "b", gender: "coed", day: "mon", venueSlug: "worthington" }),
  D({ id: "2", level: "c", gender: "mens", day: "wed", venueSlug: "worthington" }),
  D({ id: "3", level: "d", gender: "coed", day: "sun", venueSlug: "downtown" }),
  D({ id: "4", level: "open", gender: "womens", day: "wed", venueSlug: "worthington" }),
];

const EMPTY: DivisionFilters = { level: null, gender: null, day: null, venue: null };

describe("filterDivisions", () => {
  it("returns all with no filters", () => {
    expect(filterDivisions(ALL, EMPTY)).toHaveLength(4);
  });
  it("filters by gender", () => {
    expect(filterDivisions(ALL, { ...EMPTY, gender: "mens" }).map((d) => d.id)).toEqual(["2"]);
  });
  it("filters by day and venue together (AND)", () => {
    expect(filterDivisions(ALL, { ...EMPTY, day: "wed", venue: "worthington" }).map((d) => d.id)).toEqual(["2", "4"]);
  });
  it("an explicit level matches that level plus 'open' divisions", () => {
    expect(filterDivisions(ALL, { ...EMPTY, level: "b" }).map((d) => d.id)).toEqual(["1", "4"]);
  });
  it("'open' divisions are returned for any explicit level filter (all levels welcome)", () => {
    expect(filterDivisions(ALL, { ...EMPTY, level: "d" }).map((d) => d.id)).toEqual(["3", "4"]);
  });
});
