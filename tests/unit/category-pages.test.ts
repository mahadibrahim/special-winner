import { describe, expect, it } from "vitest"
import type { ApiSeason } from "@/components/landing/adult-finder"
import {
  AGE_BAND_CHIPS,
  byRegistrationCloses,
  inAgeBand,
  scopeSeasons,
} from "@/lib/programs/category-pages"

/** Minimal ApiSeason factory — only the fields the helpers read, the rest stubbed. */
function makeSeason(over: {
  id: string
  programType: string
  audienceType: string
  minAge?: number
  maxAge?: number
  registrationCloses?: string | null
  startDate?: string
}): ApiSeason {
  return {
    id: over.id,
    name: over.id,
    slug: over.id,
    startDate: over.startDate ?? "2026-09-01",
    endDate: "2026-11-01",
    price: 100,
    teamPrice: null,
    scheduleNotes: null,
    registeredCount: 0,
    maxParticipants: null,
    pricingMode: "individual",
    registrationCloses: over.registrationCloses ?? null,
    program: {
      id: "p",
      name: "p",
      slug: "p",
      programType: over.programType,
      audienceType: over.audienceType,
    },
    sport: { id: "s", name: "Soccer", slug: "soccer", icon: null, color: null },
    location: { id: "l", name: "Downtown", slug: "downtown", city: null, state: null },
    ageGroup:
      over.minAge !== undefined && over.maxAge !== undefined
        ? { id: "a", name: "band", minAge: over.minAge, maxAge: over.maxAge }
        : null,
  } as ApiSeason
}

describe("scopeSeasons", () => {
  const seasons = [
    makeSeason({ id: "adult-league", programType: "league", audienceType: "adults" }),
    makeSeason({ id: "adult-tourney", programType: "tournament", audienceType: "adults" }),
    makeSeason({ id: "youth-league", programType: "league", audienceType: "youth", minAge: 6, maxAge: 8 }),
    makeSeason({ id: "youth-camp", programType: "camp", audienceType: "youth", minAge: 6, maxAge: 12 }),
  ]

  it("filters by audience AND program type", () => {
    expect(scopeSeasons(seasons, "adult", ["league"]).map((s) => s.id)).toEqual(["adult-league"])
  })

  it("accepts multiple program types (youth leagues & classes)", () => {
    expect(scopeSeasons(seasons, "youth", ["league", "training", "clinic"]).map((s) => s.id)).toEqual([
      "youth-league",
    ])
  })

  it("returns empty for a type with no inventory", () => {
    expect(scopeSeasons(seasons, "adult", ["camp"])).toEqual([])
  })
})

describe("inAgeBand", () => {
  it("matches on range overlap", () => {
    const u8 = makeSeason({ id: "u8", programType: "league", audienceType: "youth", minAge: 6, maxAge: 8 })
    expect(inAgeBand(u8, 4, 8)).toBe(true)
    expect(inAgeBand(u8, 9, 12)).toBe(false)
  })

  it("a season without an age group matches every band", () => {
    const open = makeSeason({ id: "open", programType: "league", audienceType: "youth" })
    for (const band of AGE_BAND_CHIPS) expect(inAgeBand(open, band.min, band.max)).toBe(true)
  })
})

describe("byRegistrationCloses", () => {
  it("sorts soonest deadline first, no-deadline last, ties by startDate", () => {
    const sorted = [
      makeSeason({ id: "none", programType: "league", audienceType: "adults", registrationCloses: null, startDate: "2026-08-01" }),
      makeSeason({ id: "late", registrationCloses: "2026-08-20", programType: "league", audienceType: "adults" }),
      makeSeason({ id: "soon", registrationCloses: "2026-07-01", programType: "league", audienceType: "adults" }),
      makeSeason({ id: "none-earlier", programType: "league", audienceType: "adults", registrationCloses: null, startDate: "2026-07-15" }),
    ].sort(byRegistrationCloses)
    expect(sorted.map((s) => s.id)).toEqual(["soon", "late", "none-earlier", "none"])
  })
})
