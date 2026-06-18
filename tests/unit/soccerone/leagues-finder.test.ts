import { describe, it, expect } from "vitest"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips,
  filterSeasons, NIGHT_LABELS, type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"

const seasons: FinderSeason[] = [
  { id: "1", divisionGender: "coed",   dayOfWeek: "mon", location: { slug: "worthington", name: "Worthington" } },
  { id: "2", divisionGender: "womens", dayOfWeek: "thu", location: { slug: "worthington", name: "Worthington" } },
  { id: "3", divisionGender: "coed",   dayOfWeek: "tue", location: { slug: "downtown",    name: "Downtown" } },
  { id: "4", divisionGender: null,     dayOfWeek: null,  location: { slug: "downtown",    name: "Downtown" } },
]

describe("leagues-finder helpers", () => {
  it("derives location chips from distinct slugs present, ordered by first appearance", () => {
    expect(deriveLocationChips(seasons)).toEqual([
      { value: "worthington", label: "Worthington" },
      { value: "downtown", label: "Downtown" },
    ])
  })

  it("derives division chips only for divisionGender values present (no empty chips)", () => {
    expect(deriveDivisionChips(seasons)).toEqual([
      { value: "coed", label: "Coed" },
      { value: "womens", label: "Women's" },
    ])
  })

  it("derives night chips in week order from days present", () => {
    expect(deriveNightChips(seasons)).toEqual([
      { value: "mon", label: NIGHT_LABELS.mon },
      { value: "tue", label: NIGHT_LABELS.tue },
      { value: "thu", label: NIGHT_LABELS.thu },
    ])
  })

  it("filters by location AND division AND night; 'all' is a wildcard", () => {
    const f: FinderFilters = { location: "worthington", division: "coed", night: "all" }
    expect(filterSeasons(seasons, f).map((s) => s.id)).toEqual(["1"])
  })

  it("returns everything when all filters are 'all'", () => {
    const f: FinderFilters = { location: "all", division: "all", night: "all" }
    expect(filterSeasons(seasons, f)).toHaveLength(4)
  })

  it("seasons with null division/day are excluded only when that axis is filtered", () => {
    expect(filterSeasons(seasons, { location: "downtown", division: "all", night: "all" }).map(s => s.id)).toEqual(["3", "4"])
    expect(filterSeasons(seasons, { location: "downtown", division: "coed", night: "all" }).map(s => s.id)).toEqual(["3"])
  })
})
