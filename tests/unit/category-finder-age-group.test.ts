import { describe, it, expect } from "vitest"
import { matchesAgeGroup } from "@/lib/programs/category-pages"
import type { ApiSeason } from "@/lib/programs/api-season"

function season(ageGroupName: string | null): ApiSeason {
  return {
    ageGroup: ageGroupName
      ? { id: "ag-1", name: ageGroupName, minAge: 8, maxAge: 9 }
      : null,
  } as unknown as ApiSeason
}

describe("matchesAgeGroup", () => {
  it("matches a season whose age group name equals the filter", () => {
    expect(matchesAgeGroup(season("U10"), "U10")).toBe(true)
  })

  it("rejects a season in a different age group", () => {
    expect(matchesAgeGroup(season("U12"), "U10")).toBe(false)
  })

  it("is case-insensitive so admin-entered casing can't hide a division", () => {
    expect(matchesAgeGroup(season("u10"), "U10")).toBe(true)
  })

  it("keeps seasons with no age group — they apply to any age", () => {
    expect(matchesAgeGroup(season(null), "U10")).toBe(true)
  })

  it("matches everything when no filter is active", () => {
    expect(matchesAgeGroup(season("U12"), null)).toBe(true)
  })
})
