// Regression coverage for a bug shipped in youth Phase 1: CategoryFinder had
// no way to scope by sport, so /youth/leagues/soccer rendered EVERY youth
// league — production showed "Soccer 20 · Futsal 3" on a page titled Youth
// Soccer. It is also what blocked futsal from having its own page, since a
// futsal page would have shown soccer right back.
//
// scopeSeasons is the single funnel every category page passes through, so the
// sport filter belongs there rather than in the component.
import { describe, it, expect } from "vitest"
import { scopeSeasons } from "@/lib/programs/category-pages"
import type { ApiSeason } from "@/lib/programs/api-season"

function season(sportSlug: string, programType = "league"): ApiSeason {
  return {
    sport: { id: `sp-${sportSlug}`, name: sportSlug, slug: sportSlug, icon: null, color: null },
    program: { programType, audienceType: "youth" },
    ageGroup: { id: "ag", name: "U10", minAge: 8, maxAge: 9 },
  } as unknown as ApiSeason
}

const ALL = [season("soccer"), season("futsal"), season("basketball")]

describe("scopeSeasons — sport scoping", () => {
  it("returns every sport when no sport is given, exactly as before", () => {
    // The default MUST stay unscoped: five existing pages rely on it.
    expect(scopeSeasons(ALL, "youth", ["league"]).map((s) => s.sport.slug))
      .toEqual(["soccer", "futsal", "basketball"])
  })

  it("keeps only the named sport when one is given", () => {
    expect(scopeSeasons(ALL, "youth", ["league"], "soccer").map((s) => s.sport.slug))
      .toEqual(["soccer"])
  })

  it("keeps futsal off the soccer page — the actual production bug", () => {
    const onSoccerPage = scopeSeasons(ALL, "youth", ["league"], "soccer")
    expect(onSoccerPage.some((s) => s.sport.slug === "futsal")).toBe(false)
  })

  it("keeps soccer off the futsal page — the mirror of it", () => {
    const onFutsalPage = scopeSeasons(ALL, "youth", ["league"], "futsal")
    expect(onFutsalPage.map((s) => s.sport.slug)).toEqual(["futsal"])
  })

  it("still applies audience and program type alongside the sport", () => {
    const mixed = [season("soccer", "league"), season("soccer", "camp")]
    expect(scopeSeasons(mixed, "youth", ["league"], "soccer")).toHaveLength(1)
  })

  it("returns nothing for a sport with no inventory rather than falling back to all", () => {
    // A silent fallback to "show everything" is how the original bug read to a
    // visitor, so an empty sport must stay empty.
    expect(scopeSeasons(ALL, "youth", ["league"], "hockey")).toEqual([])
  })
})
