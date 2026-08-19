import { describe, it, expect } from "vitest"
import { divisionRowModel, type SeasonLike } from "@/lib/leagues/division-row-model"

// Mirrors a real `/api/public/seasons` youth league row. `signupModes` is the
// team-vs-individual discriminator (via isTeamOnly), NOT teamPrice — a
// dual-mode season carries a teamPrice too.
const base: SeasonLike = {
  id: "s1",
  name: "Youth Soccer League — Winter I",
  price: 195,
  teamPrice: null,
  effectiveTeamPrice: null,
  teamEarlyBirdActive: false,
  spotsLeft: null,
  dayOfWeek: "sat",
  startDate: "2026-11-08",
  endDate: "2027-01-24",
  termLabel: "Winter I",
  minAge: 8,
  maxAge: 9,
  divisionGender: null,
  status: "open",
  signupModes: ["individual"],
  pricingMode: "per_individual",
  registeredCount: 0,
  maxParticipants: null,
  program: { programType: "league", audienceType: "parents" },
  ageGroup: { minAge: 8, maxAge: 9 },
}

describe("divisionRowModel", () => {
  it("team-only season → competitive team row", () => {
    const row = divisionRowModel({
      ...base,
      signupModes: ["team"],
      pricingMode: "per_team",
      teamPrice: 1150,
      effectiveTeamPrice: 1150,
      divisionGender: "boys",
    })
    expect(row.kind).toBe("competitive")
    expect(row.kindLabel).toBe("Competitive")
    expect(row.href).toBe("/register/s1?mode=team")
    expect(row.cta).toBe("Enter team →")
    expect(row.price).toBe(1150)
    expect(row.priceUnit).toBe("per team")
    expect(row.group).toContain("boys")
  })

  it("individual season → developmental row booking per kid", () => {
    const row = divisionRowModel(base)
    expect(row.kind).toBe("developmental")
    expect(row.href).toBe("/register/s1")
    expect(row.cta).toBe("Book →")
    expect(row.price).toBe(195)
    expect(row.priceUnit).toBe("per kid")
  })

  it("dual-mode season keeps the solo path — team price never hides it", () => {
    const row = divisionRowModel({
      ...base,
      signupModes: ["individual", "team"],
      pricingMode: "per_team",
      teamPrice: 1150,
      effectiveTeamPrice: 1150,
    })
    expect(row.kind).toBe("developmental")
    expect(row.href).toBe("/register/s1")
    expect(row.cta).toBe("Book →")
    expect(row.price).toBe(195)
    expect(row.priceUnit).toBe("per kid")
  })

  it("active team early-bird shows discounted price with struck base", () => {
    const row = divisionRowModel({
      ...base,
      signupModes: ["team"],
      pricingMode: "per_team",
      teamPrice: 1150,
      effectiveTeamPrice: 1050,
      teamEarlyBirdActive: true,
    })
    expect(row.price).toBe(1050)
    expect(row.basePrice).toBe(1150)
  })

  it("no early-bird → basePrice null (nothing to strike)", () => {
    expect(divisionRowModel(base).basePrice).toBeNull()
    expect(
      divisionRowModel({
        ...base,
        signupModes: ["team"],
        teamPrice: 1150,
        effectiveTeamPrice: 1150,
      }).basePrice,
    ).toBeNull()
  })

  it("spotsLeft passes through on individual rows only", () => {
    expect(divisionRowModel({ ...base, spotsLeft: 3 }).spotsLeft).toBe(3)
    expect(divisionRowModel(base).spotsLeft).toBeNull()
    // No team-capacity column exists — a team row must never print a count.
    expect(
      divisionRowModel({ ...base, signupModes: ["team"], teamPrice: 1150, spotsLeft: 3 })
        .spotsLeft,
    ).toBeNull()
  })

  it("soldOut is honest for both kinds", () => {
    expect(divisionRowModel({ ...base, spotsLeft: 0 }).soldOut).toBe(true)
    const teamSoldOut = divisionRowModel({
      ...base,
      signupModes: ["team"],
      teamPrice: 1150,
      spotsLeft: 0,
    })
    expect(teamSoldOut.soldOut).toBe(true)
    expect(teamSoldOut.spotsLeft).toBeNull()
    expect(divisionRowModel({ ...base, spotsLeft: 3 }).soldOut).toBe(false)
    expect(divisionRowModel(base).soldOut).toBe(false)
  })

  it("group derives U-label from maxAge and appends gender", () => {
    expect(divisionRowModel({ ...base, minAge: 9, maxAge: 10 }).group).toBe("U10")
    expect(
      divisionRowModel({ ...base, minAge: 13, maxAge: 14, divisionGender: "girls" }).group,
    ).toBe("U14 girls")
  })

  it("meta joins day and start date, dropping nulls", () => {
    expect(divisionRowModel(base).meta).toBe("Sat · starts Nov 8")
    expect(divisionRowModel({ ...base, dayOfWeek: null }).meta).toBe("starts Nov 8")
  })
})
