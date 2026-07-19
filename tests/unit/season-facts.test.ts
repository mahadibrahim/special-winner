import { describe, it, expect } from "vitest"
import type { ApiSeason } from "@/lib/programs/api-season"
import {
  openScopedSeasons,
  effectiveIndividualPrice,
  minIndividualPrice,
  effectiveTeamTotal,
  minTeamTotal,
  earliestRegistrationCloses,
  earliestStartDate,
  minHoldDeposit,
  primaryVenueName,
  primaryTermLabel,
  ageRangeAcross,
} from "@/lib/programs/season-facts"

const NOW = new Date("2026-07-19T12:00:00Z")

function mk(overrides: Partial<ApiSeason> = {}): ApiSeason {
  return {
    id: "s1",
    name: "Fall 2026",
    slug: "fall-2026",
    startDate: "2026-09-14",
    endDate: "2026-11-08",
    price: 120,
    teamPrice: 1200,
    registeredCount: 0,
    maxParticipants: null,
    pricingMode: "per_individual",
    signupModes: ["individual", "team"],
    status: "open",
    registrationCloses: "2026-09-03T23:59:00.000Z",
    scheduleNotes: null,
    dayOfWeek: null,
    startTime: null,
    endTime: null,
    minAge: null,
    maxAge: null,
    program: {
      id: "p1",
      name: "Adult Soccer",
      slug: "adult-soccer",
      programType: "league",
      audienceType: "adults",
    },
    sport: { id: "sp1", name: "Soccer", slug: "soccer", icon: null, color: null },
    location: { id: "l1", name: "Worthington", slug: "worthington", city: null, state: "OH" },
    ageGroup: null,
    ...overrides,
  } as ApiSeason
}

describe("openScopedSeasons", () => {
  it("keeps only OPEN seasons matching audience + program type", () => {
    const seasons = [
      mk(),
      mk({ id: "s2", status: "forming" }),
      mk({ id: "s3", program: { ...mk().program, programType: "tournament" } }),
      mk({
        id: "s4",
        program: { ...mk().program, audienceType: "parents" },
        ageGroup: { id: "a", name: "U10", minAge: 8, maxAge: 10 },
      }),
    ]
    expect(openScopedSeasons(seasons, "adult", ["league"]).map((s) => s.id)).toEqual(["s1"])
    expect(openScopedSeasons(seasons, "youth", ["league"]).map((s) => s.id)).toEqual(["s4"])
  })
})

describe("effectiveIndividualPrice / minIndividualPrice", () => {
  it("returns list price when no early-bird applies", () => {
    expect(effectiveIndividualPrice(mk(), NOW)).toBe(120)
  })
  it("returns null when solo signup is not offered", () => {
    expect(effectiveIndividualPrice(mk({ signupModes: ["team"] }), NOW)).toBeNull()
  })
  it("applies an active early-bird that undercuts list", () => {
    const s = mk({ earlyBirdPrice: 100, earlyBirdDeadline: "2026-08-01T00:00:00Z" })
    expect(effectiveIndividualPrice(s, NOW)).toBe(100)
  })
  it("ignores an expired early-bird", () => {
    const s = mk({ earlyBirdPrice: 100, earlyBirdDeadline: "2026-06-01T00:00:00Z" })
    expect(effectiveIndividualPrice(s, NOW)).toBe(120)
  })
  it("ignores a misconfigured early-bird at/above list price", () => {
    const s = mk({ earlyBirdPrice: 1000, earlyBirdDeadline: "2026-08-01T00:00:00Z" })
    expect(effectiveIndividualPrice(s, NOW)).toBe(120)
  })
  it("min picks the cheapest across the set", () => {
    const seasons = [mk({ price: 150 }), mk({ id: "s2", price: 120 })]
    expect(minIndividualPrice(seasons, NOW)).toBe(120)
    expect(minIndividualPrice([], NOW)).toBeNull()
  })
})

describe("effectiveTeamTotal / minTeamTotal", () => {
  it("returns the list team price by default", () => {
    expect(effectiveTeamTotal(mk(), NOW)).toBe(1200)
  })
  it("is early-bird aware", () => {
    const s = mk({ earlyBirdTeamPrice: 1000, earlyBirdDeadline: "2026-08-01T00:00:00Z" })
    expect(effectiveTeamTotal(s, NOW)).toBe(1000)
    expect(minTeamTotal([s, mk({ id: "s2" })], NOW)).toBe(1000)
  })
  it("returns null when team signup is not offered / unpriced", () => {
    expect(effectiveTeamTotal(mk({ signupModes: ["individual"] }), NOW)).toBeNull()
    expect(effectiveTeamTotal(mk({ teamPrice: null }), NOW)).toBeNull()
  })
})

describe("earliestRegistrationCloses / earliestStartDate", () => {
  it("finds the soonest deadline and start", () => {
    const seasons = [
      mk({ registrationCloses: "2026-09-10T00:00:00Z", startDate: "2026-09-21" }),
      mk({ id: "s2", registrationCloses: "2026-09-03T00:00:00Z", startDate: "2026-09-14" }),
      mk({ id: "s3", registrationCloses: null }),
    ]
    expect(earliestRegistrationCloses(seasons)?.toISOString()).toBe("2026-09-03T00:00:00.000Z")
    expect(earliestStartDate(seasons)).toBe("2026-09-14")
  })
  it("returns null on an empty/deadline-less set", () => {
    expect(earliestRegistrationCloses([mk({ registrationCloses: null })])).toBeNull()
    expect(earliestStartDate([])).toBeNull()
  })
})

describe("minHoldDeposit", () => {
  it("returns the smallest valid partial deposit", () => {
    const seasons = [
      mk({ allowDeposit: true, deposit: 75, price: 130 }),
      mk({ id: "s2", allowDeposit: true, deposit: 50, price: 130 }),
    ]
    expect(minHoldDeposit(seasons)).toBe(50)
  })
  it("omits deposits that are disabled, zero, or not a real partial", () => {
    expect(minHoldDeposit([mk({ allowDeposit: false, deposit: 50 })])).toBeNull()
    expect(minHoldDeposit([mk({ allowDeposit: true, deposit: 0 })])).toBeNull()
    // deposit >= price is full payment, not a hold
    expect(minHoldDeposit([mk({ allowDeposit: true, deposit: 130, price: 130 })])).toBeNull()
  })
})

describe("primaryVenueName", () => {
  it("returns the most common venue", () => {
    const seasons = [
      mk(),
      mk({ id: "s2" }),
      mk({ id: "s3", location: { ...mk().location, name: "Downtown" } }),
    ]
    expect(primaryVenueName(seasons)).toBe("Worthington")
    expect(primaryVenueName([])).toBeNull()
  })
})

describe("primaryTermLabel", () => {
  it("takes the termLabel of the soonest-closing season that has one", () => {
    const seasons = [
      mk({ registrationCloses: "2026-09-10T00:00:00Z", termLabel: "Fall II 2026" }),
      mk({ id: "s2", registrationCloses: "2026-09-03T00:00:00Z", termLabel: "Fall 2026" }),
    ]
    expect(primaryTermLabel(seasons)).toBe("Fall 2026")
  })
  it("skips seasons without a termLabel", () => {
    const seasons = [
      mk({ registrationCloses: "2026-09-03T00:00:00Z", termLabel: null }),
      mk({ id: "s2", registrationCloses: "2026-09-10T00:00:00Z", termLabel: "Winter I" }),
    ]
    expect(primaryTermLabel(seasons)).toBe("Winter I")
  })
  it("falls back to a generic 'Season YYYY' name when no termLabel exists", () => {
    const seasons = [mk({ termLabel: null, name: "Fall 2026" })]
    expect(primaryTermLabel(seasons)).toBe("Fall 2026")
  })
  it("returns null when neither a termLabel nor a generic name exists", () => {
    expect(primaryTermLabel([mk({ termLabel: null, name: "Memorial Day Premier" })])).toBeNull()
    expect(primaryTermLabel([])).toBeNull()
  })
})

describe("ageRangeAcross", () => {
  it("spans the widest range across age groups", () => {
    const seasons = [
      mk({ ageGroup: { id: "a1", name: "U8", minAge: 4, maxAge: 8 } }),
      mk({ id: "s2", ageGroup: { id: "a2", name: "U12", minAge: 9, maxAge: 12 } }),
    ]
    expect(ageRangeAcross(seasons)).toEqual({ min: 4, max: 12 })
  })
  it("falls back to season-level minAge/maxAge when no age group is set", () => {
    const seasons = [mk({ ageGroup: null, minAge: 5, maxAge: 10 })]
    expect(ageRangeAcross(seasons)).toEqual({ min: 5, max: 10 })
  })
  it("returns null when no season carries any age data", () => {
    expect(ageRangeAcross([mk({ ageGroup: null, minAge: null, maxAge: null })])).toBeNull()
    expect(ageRangeAcross([])).toBeNull()
  })
})
