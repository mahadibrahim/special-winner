import { describe, it, expect } from "vitest"
import { isYouthSeasonRow, filterYouthSeasons } from "@/lib/leagues/youth-seasons"

// Shape of what /api/public/seasons returns for `?audience=youth`, trimmed to
// the fields the guard reads.
const row = (ageGroup: { name: string; minAge: number | null } | null) => ({
  id: "s-1",
  name: "Fall 2026 Coed",
  ageGroup: ageGroup ? { id: "ag-1", maxAge: null, ...ageGroup } : null,
})

describe("isYouthSeasonRow", () => {
  it("keeps a real youth age group", () => {
    expect(isYouthSeasonRow(row({ name: "U10", minAge: 9 }))).toBe(true)
  })

  it("drops a season with NO age group — the endpoint's `ageGroupId IS NULL` branch returns adult rows into the youth view", () => {
    expect(isYouthSeasonRow(row(null))).toBe(false)
  })

  it("drops an explicitly adult age group", () => {
    expect(isYouthSeasonRow(row({ name: "Adult 18+", minAge: 18 }))).toBe(false)
  })

  it("drops an age group with no minAge — nothing places it on the youth ladder", () => {
    expect(isYouthSeasonRow(row({ name: "Open", minAge: null }))).toBe(false)
  })

  it("keeps the youngest band (minAge 0 must not be read as falsy)", () => {
    expect(isYouthSeasonRow(row({ name: "U6", minAge: 0 }))).toBe(true)
  })

  it("survives a malformed row instead of throwing the whole page", () => {
    expect(isYouthSeasonRow(undefined)).toBe(false)
    expect(isYouthSeasonRow({})).toBe(false)
  })
})

describe("filterYouthSeasons", () => {
  it("strips the age-group-less adult row out of a mixed term", () => {
    const youth = row({ name: "U10", minAge: 9 })
    const strayAdult = { ...row(null), name: "Men's C" }
    expect(filterYouthSeasons([youth, strayAdult])).toEqual([youth])
  })

  it("returns empty when every row is disqualified — callers redirect on empty", () => {
    expect(filterYouthSeasons([row(null), row({ name: "Adult 18+", minAge: 18 })])).toEqual([])
  })

  it("is a no-op on an all-youth term", () => {
    const rows = [row({ name: "U8", minAge: 7 }), row({ name: "U12", minAge: 11 })]
    expect(filterYouthSeasons(rows)).toEqual(rows)
  })
})
