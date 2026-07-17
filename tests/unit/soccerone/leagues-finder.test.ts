import { describe, it, expect } from "vitest"
import {
  deriveLocationChips, deriveDivisionChips, deriveNightChips, deriveLevelChips, deriveAgesChips,
  filterSeasons, NIGHT_LABELS, LEVEL_LABELS, type FinderSeason, type FinderFilters,
} from "@/lib/soccerone/leagues-finder"

const seasons: FinderSeason[] = [
  { id: "1", divisionGender: "coed",   dayOfWeek: "mon", location: { slug: "worthington", name: "Worthington" }, skillLevel: "a" },
  { id: "2", divisionGender: "womens", dayOfWeek: "thu", location: { slug: "worthington", name: "Worthington" }, skillLevel: "b" },
  { id: "3", divisionGender: "coed",   dayOfWeek: "tue", location: { slug: "downtown",    name: "Downtown" },    skillLevel: "a" },
  { id: "4", divisionGender: null,     dayOfWeek: null,  location: { slug: "downtown",    name: "Downtown" },    skillLevel: null },
]

// Regression: an `open` division accepts players of ANY level, so it must
// survive every level filter. `filterDivisions` (the Aspire sibling in
// lib/leagues/division-filters.ts) has always done this deliberately:
//   if (f.level && d.level !== f.level && d.level !== "open") return false;
// filterSeasons exact-matched instead, which hid real inventory. In prod,
// "Fall 2026 — Women's Open" carries skill_level='open' — tapping any level
// chip on gosoccerone.com made it disappear.
describe("filterSeasons — 'open' divisions pass every level filter", () => {
  const withOpen: FinderSeason[] = [
    { id: "b1",   divisionGender: "coed",   dayOfWeek: "mon", location: { slug: "worthington", name: "Worthington" }, skillLevel: "b" },
    { id: "c1",   divisionGender: "coed",   dayOfWeek: "tue", location: { slug: "worthington", name: "Worthington" }, skillLevel: "c" },
    { id: "open1", divisionGender: "womens", dayOfWeek: "wed", location: { slug: "worthington", name: "Worthington" }, skillLevel: "open" },
    { id: "null1", divisionGender: "coed",   dayOfWeek: "sun", location: { slug: "worthington", name: "Worthington" }, skillLevel: null },
  ]
  const base = { location: "all", division: "all", night: "all" } as const

  it.each(["a", "b", "c", "d"])("keeps the open division when level=%s is selected", (level) => {
    const ids = filterSeasons(withOpen, { ...base, level }).map((s) => s.id)
    expect(ids).toContain("open1")
  })

  it("still narrows to the selected level plus open (not a wildcard)", () => {
    const ids = filterSeasons(withOpen, { ...base, level: "b" }).map((s) => s.id)
    expect(ids).toEqual(["b1", "open1"])
    expect(ids).not.toContain("c1")
  })

  it("selecting 'open' explicitly shows only open divisions", () => {
    const ids = filterSeasons(withOpen, { ...base, level: "open" }).map((s) => s.id)
    expect(ids).toEqual(["open1"])
  })

  it("a null skillLevel is NOT treated as open (unset ≠ open-to-all)", () => {
    // The three 30+/40+ age divisions in prod have skill_level = null. They are
    // age-scoped, not open-to-every-level, so a level filter must exclude them.
    const ids = filterSeasons(withOpen, { ...base, level: "b" }).map((s) => s.id)
    expect(ids).not.toContain("null1")
  })

  it("level='all' still includes everything, open and null alike", () => {
    const ids = filterSeasons(withOpen, { ...base, level: "all" }).map((s) => s.id)
    expect(ids).toEqual(["b1", "c1", "open1", "null1"])
  })

  it("open survives level filtering but still AND-combines with other axes", () => {
    const ids = filterSeasons(withOpen, { location: "worthington", division: "coed", night: "all", level: "b" }).map((s) => s.id)
    expect(ids).toEqual(["b1"]) // open1 is womens — excluded by the division axis, not the level axis
  })
})

// Regression: the term pages fetch without an audience filter, so youth and
// adult divisions of the same term land in one finder (prod winter pages
// mixed 23 cards). The Ages axis separates them; youth = the program's
// audienceType === "parents" (parents register their kids).
describe("filterSeasons — ages axis", () => {
  const mixed: FinderSeason[] = [
    // program.audienceType mirrors the real /api/public/seasons payload —
    // the first version of these fixtures put audienceType top-level (matching
    // the implementation, not the API) and the bug sailed through green tests.
    { id: "a1", divisionGender: "coed", dayOfWeek: "mon", location: { slug: "worthington", name: "Worthington" }, skillLevel: "c", program: { audienceType: "adults" } },
    { id: "y1", divisionGender: null, dayOfWeek: "sat", location: { slug: "worthington", name: "Worthington" }, skillLevel: null, program: { audienceType: "parents" } },
  ]
  const base = { location: "all", division: "all", night: "all", level: "all" } as const

  it("ages='adult' hides youth divisions", () => {
    expect(filterSeasons(mixed, { ...base, ages: "adult" }).map((s) => s.id)).toEqual(["a1"])
  })
  it("ages='youth' shows only youth divisions", () => {
    expect(filterSeasons(mixed, { ...base, ages: "youth" }).map((s) => s.id)).toEqual(["y1"])
  })
  it("ages='all' shows everything (and a missing audienceType counts as adult)", () => {
    const noField: FinderSeason[] = [{ id: "n1", divisionGender: "coed", dayOfWeek: "mon", location: { slug: "worthington", name: "Worthington" }, skillLevel: "c" }]
    expect(filterSeasons(mixed, { ...base, ages: "all" })).toHaveLength(2)
    expect(filterSeasons(noField, { ...base, ages: "adult" })).toHaveLength(1)
  })
  it("derives Ages chips only when both audiences are present", () => {
    expect(deriveAgesChips(mixed)).toEqual([
      { value: "adult", label: "Adult" },
      { value: "youth", label: "Youth" },
    ])
    expect(deriveAgesChips(mixed.slice(0, 1))).toEqual([])
  })
})

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
