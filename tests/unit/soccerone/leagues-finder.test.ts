import { describe, it, expect } from "vitest"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips, deriveLevelChips,
  filterSeasons, NIGHT_LABELS, LEVEL_LABELS, type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"

const seasons: FinderSeason[] = [
  { id: "1", divisionGender: "coed",   dayOfWeek: "mon", location: { slug: "worthington", name: "Worthington" }, skillLevel: "a" },
  { id: "2", divisionGender: "womens", dayOfWeek: "thu", location: { slug: "worthington", name: "Worthington" }, skillLevel: "b" },
  { id: "3", divisionGender: "coed",   dayOfWeek: "tue", location: { slug: "downtown",    name: "Downtown" },    skillLevel: "a" },
  { id: "4", divisionGender: null,     dayOfWeek: null,  location: { slug: "downtown",    name: "Downtown" },    skillLevel: null },
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
    const f: FinderFilters = { location: "worthington", division: "coed", night: "all", level: "all" }
    expect(filterSeasons(seasons, f).map((s) => s.id)).toEqual(["1"])
  })

  it("returns everything when all filters are 'all'", () => {
    const f: FinderFilters = { location: "all", division: "all", night: "all", level: "all" }
    expect(filterSeasons(seasons, f)).toHaveLength(4)
  })

  it("seasons with null division/day are excluded only when that axis is filtered", () => {
    expect(filterSeasons(seasons, { location: "downtown", division: "all", night: "all", level: "all" }).map(s => s.id)).toEqual(["3", "4"])
    expect(filterSeasons(seasons, { location: "downtown", division: "coed", night: "all", level: "all" }).map(s => s.id)).toEqual(["3"])
  })

  // --- Level axis ---

  it("derives level chips in canonical a→b→c→d→open order, only for skill levels present", () => {
    // seasons have 'a' and 'b'; neither c, d, open are present
    expect(deriveLevelChips(seasons)).toEqual([
      { value: "a", label: LEVEL_LABELS.a },
      { value: "b", label: LEVEL_LABELS.b },
    ])
  })

  it("derives level chips in canonical order even when seasons appear out of order", () => {
    const mixed: FinderSeason[] = [
      { id: "x1", divisionGender: "coed", dayOfWeek: "mon", location: { slug: "loc", name: "Loc" }, skillLevel: "open" },
      { id: "x2", divisionGender: "coed", dayOfWeek: "mon", location: { slug: "loc", name: "Loc" }, skillLevel: "c" },
      { id: "x3", divisionGender: "coed", dayOfWeek: "mon", location: { slug: "loc", name: "Loc" }, skillLevel: "a" },
    ]
    expect(deriveLevelChips(mixed)).toEqual([
      { value: "a", label: "A" },
      { value: "c", label: "C" },
      { value: "open", label: "Open" },
    ])
  })

  it("deriveLevelChips skips seasons where skillLevel is null", () => {
    // season 4 has skillLevel: null — should not appear as a chip
    const chips = deriveLevelChips(seasons)
    expect(chips.map(c => c.value)).not.toContain(null)
    expect(chips.map(c => c.value)).not.toContain("null")
  })

  it("filterSeasons with a specific level narrows correctly", () => {
    const f: FinderFilters = { location: "all", division: "all", night: "all", level: "a" }
    expect(filterSeasons(seasons, f).map(s => s.id)).toEqual(["1", "3"])
  })

  it("filterSeasons level AND-combines with other axes", () => {
    const f: FinderFilters = { location: "worthington", division: "all", night: "all", level: "a" }
    expect(filterSeasons(seasons, f).map(s => s.id)).toEqual(["1"])
  })

  it("filterSeasons level: 'all' is a wildcard (includes all including null)", () => {
    const f: FinderFilters = { location: "downtown", division: "all", night: "all", level: "all" }
    expect(filterSeasons(seasons, f).map(s => s.id)).toEqual(["3", "4"])
  })

  it("filterSeasons excludes seasons with skillLevel: null when level is a specific value", () => {
    const f: FinderFilters = { location: "downtown", division: "all", night: "all", level: "a" }
    // season 4 has skillLevel: null, season 3 has skillLevel: 'a' → only 3 passes
    expect(filterSeasons(seasons, f).map(s => s.id)).toEqual(["3"])
  })

  it("LEVEL_LABELS has correct human labels for all canonical values", () => {
    expect(LEVEL_LABELS.a).toBe("A")
    expect(LEVEL_LABELS.b).toBe("B")
    expect(LEVEL_LABELS.c).toBe("C")
    expect(LEVEL_LABELS.d).toBe("D")
    expect(LEVEL_LABELS.open).toBe("Open")
  })
})
