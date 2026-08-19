import { describe, it, expect } from "vitest"
import { divisionRowModel } from "@/lib/leagues/division-row-model"

const base = {
  id: "s1",
  name: "Youth Soccer League — Winter I",
  skillLevel: null as string | null,
  teamPrice: null as number | null,
  effectiveTeamPrice: null as number | null,
  teamEarlyBirdActive: false,
  price: 195,
  earlyBirdPrice: null as number | null,
  earlyBirdDeadline: null as string | null,
  spotsLeft: null as number | null,
  dayOfWeek: "Saturday",
  startDate: "2026-11-08",
  termLabel: "Winter I",
  minAge: 8,
  maxAge: 9,
  divisionGender: null as string | null,
  status: "registration_open",
}

describe("divisionRowModel", () => {
  it("team-priced season → competitive team row", () => {
    const row = divisionRowModel({
      ...base,
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

  it("active team early-bird shows discounted price with struck base", () => {
    const row = divisionRowModel({
      ...base,
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
      divisionRowModel({ ...base, teamPrice: 1150, effectiveTeamPrice: 1150 }).basePrice,
    ).toBeNull()
  })

  it("spotsLeft passes through only when capped", () => {
    expect(divisionRowModel({ ...base, spotsLeft: 3 }).spotsLeft).toBe(3)
    expect(divisionRowModel(base).spotsLeft).toBeNull()
  })

  it("group derives U-label from maxAge and appends gender", () => {
    expect(divisionRowModel({ ...base, minAge: 9, maxAge: 10 }).group).toBe("U10")
    expect(
      divisionRowModel({ ...base, minAge: 13, maxAge: 14, divisionGender: "girls" }).group,
    ).toBe("U14 girls")
  })

  it("meta joins day and start date, dropping nulls", () => {
    expect(divisionRowModel(base).meta).toBe("Sat · starts Nov 8")
    expect(divisionRowModel({ ...base, dayOfWeek: null as any }).meta).toBe("starts Nov 8")
  })
})
