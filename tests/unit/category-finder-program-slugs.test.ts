import { describe, it, expect } from "vitest"
import { scopeSeasons } from "@/lib/programs/category-pages"
import type { ApiSeason } from "@/lib/programs/api-season"

function campSeason(programSlug: string): ApiSeason {
  return {
    sport: { id: "sp-soccer", name: "soccer", slug: "soccer", icon: null, color: null },
    program: { slug: programSlug, programType: "camp", audienceType: "youth" },
    ageGroup: { id: "ag", name: "U10", minAge: 8, maxAge: 9 },
  } as unknown as ApiSeason
}

const ALL = [
  campSeason("summer-day-camp"),
  campSeason("goalie-camp"),
  campSeason("schools-out-day-camp"),
]

describe("scopeSeasons — program-slug scoping", () => {
  it("returns every program when no slugs are given, exactly as before", () => {
    expect(scopeSeasons(ALL, "youth", ["camp"]).map((s) => s.program.slug))
      .toEqual(["summer-day-camp", "goalie-camp", "schools-out-day-camp"])
  })

  it("keeps only the named programs when slugs are given", () => {
    expect(
      scopeSeasons(ALL, "youth", ["camp"], undefined, ["summer-day-camp"]).map(
        (s) => s.program.slug,
      ),
    ).toEqual(["summer-day-camp"])
  })

  it("accepts multiple slugs — the specialty family spans several programs", () => {
    expect(
      scopeSeasons(ALL, "youth", ["camp"], undefined, [
        "goalie-camp",
        "schools-out-day-camp",
      ]),
    ).toHaveLength(2)
  })

  it("returns nothing for slugs with no inventory rather than falling back to all", () => {
    // Silent fallback-to-everything is the leagues sport-scoping bug all
    // over again — an empty family must render the notify empty state.
    expect(scopeSeasons(ALL, "youth", ["camp"], undefined, ["defender-camp"])).toEqual([])
  })

  it("an empty array means 'no filter', matching the omitted-prop default", () => {
    expect(scopeSeasons(ALL, "youth", ["camp"], undefined, [])).toHaveLength(3)
  })
})
