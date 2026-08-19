import { describe, it, expect } from "vitest"
import { divisionRowModel, type SeasonLike } from "@/lib/leagues/division-row-model"

// Mirrors a real `/api/public/seasons` youth league row (prod shape, verified
// 2026-08-18): the age label lives on the nested `ageGroup`, season-level
// minAge/maxAge/divisionGender are NULL, and the season name embeds the group.
// `signupModes` is the door discriminator — NOT teamPrice, which a dual-mode
// season carries too.
const base: SeasonLike = {
  id: "s1",
  name: "Winter 1 2026-27 — U10",
  price: 110,
  teamPrice: null,
  effectiveTeamPrice: null,
  teamEarlyBirdActive: false,
  earlyBirdPrice: null,
  earlyBirdDeadline: null,
  spotsLeft: null,
  dayOfWeek: "sat",
  startDate: "2026-11-08",
  endDate: "2027-01-24",
  termLabel: "Winter 1 2026-27",
  minAge: null,
  maxAge: null,
  divisionGender: null,
  status: "open",
  signupModes: ["individual"],
  pricingMode: "per_individual",
  registeredCount: 0,
  maxParticipants: null,
  program: { programType: "league", audienceType: "parents" },
  ageGroup: { name: "U10", minAge: 8, maxAge: 9 },
}

const dual: SeasonLike = {
  ...base,
  signupModes: ["individual", "team"],
  pricingMode: "per_team",
  teamPrice: 850,
  effectiveTeamPrice: 800,
  teamEarlyBirdActive: true,
}

const teamOnly: SeasonLike = {
  ...base,
  signupModes: ["team"],
  pricingMode: "per_team",
  teamPrice: 850,
  effectiveTeamPrice: 850,
}

describe("divisionRowModel — purchase paths", () => {
  it("dual-mode season opens BOTH doors, each deep-linked to its own mode", () => {
    const row = divisionRowModel(dual)
    expect(row.kind).toBe("competitive")
    expect(row.kindLabel).toBe("Competitive")

    expect(row.team).not.toBeNull()
    expect(row.team!.href).toBe("/register/s1?mode=team")
    expect(row.team!.price).toBe(800)
    expect(row.team!.basePrice).toBe(850)
    expect(row.team!.cta).toBe("Enter team →")

    expect(row.solo).not.toBeNull()
    expect(row.solo!.href).toBe("/register/s1?mode=individual")
    expect(row.solo!.price).toBe(110)
    expect(row.solo!.basePrice).toBeNull()
    expect(row.solo!.cta).toBe("Book solo →")
  })

  it("team-only season has no solo door", () => {
    const row = divisionRowModel(teamOnly)
    expect(row.kind).toBe("competitive")
    expect(row.solo).toBeNull()
    expect(row.team!.href).toBe("/register/s1?mode=team")
    expect(row.team!.price).toBe(850)
    expect(row.team!.basePrice).toBeNull()
  })

  it("individual-only season has no team door and reads developmental", () => {
    const row = divisionRowModel(base)
    expect(row.kind).toBe("developmental")
    expect(row.kindLabel).toBe("Developmental")
    expect(row.team).toBeNull()
    expect(row.solo!.href).toBe("/register/s1?mode=individual")
    expect(row.solo!.price).toBe(110)
    // No team door beside it — no need to qualify the verb.
    expect(row.solo!.cta).toBe("Book →")
  })

  it("legacy rows without signupModes fall back to pricingMode", () => {
    const legacyTeam = divisionRowModel({
      ...base,
      signupModes: undefined,
      pricingMode: "per_team",
      teamPrice: 850,
    })
    expect(legacyTeam.kind).toBe("competitive")
    expect(legacyTeam.solo).toBeNull()
    expect(legacyTeam.team!.price).toBe(850)

    const legacySolo = divisionRowModel({ ...base, signupModes: undefined })
    expect(legacySolo.team).toBeNull()
    expect(legacySolo.solo!.price).toBe(110)
  })

  it("team price falls back to the list team price, then the player price", () => {
    expect(
      divisionRowModel({ ...teamOnly, effectiveTeamPrice: null }).team!.price,
    ).toBe(850)
    expect(
      divisionRowModel({ ...teamOnly, effectiveTeamPrice: null, teamPrice: null }).team!.price,
    ).toBe(110)
  })
})

describe("divisionRowModel — early bird", () => {
  it("team early bird strikes the list team price only when it is a discount", () => {
    expect(divisionRowModel(dual).team!.basePrice).toBe(850)
    // Flag set but no actual reduction — nothing to strike.
    expect(
      divisionRowModel({ ...dual, effectiveTeamPrice: 850 }).team!.basePrice,
    ).toBeNull()
    expect(
      divisionRowModel({ ...dual, teamEarlyBirdActive: false }).team!.basePrice,
    ).toBeNull()
  })

  it("solo early bird applies while the deadline is in the future", () => {
    const s: SeasonLike = { ...base, earlyBirdPrice: 95, earlyBirdDeadline: "2026-10-01T00:00:00Z" }
    const active = divisionRowModel(s, new Date("2026-09-01T00:00:00Z"))
    expect(active.solo!.price).toBe(95)
    expect(active.solo!.basePrice).toBe(110)

    const expired = divisionRowModel(s, new Date("2026-10-02T00:00:00Z"))
    expect(expired.solo!.price).toBe(110)
    expect(expired.solo!.basePrice).toBeNull()
  })

  it("a solo early bird at or above list price is a misconfiguration, not a discount", () => {
    const row = divisionRowModel(
      { ...base, earlyBirdPrice: 1000, earlyBirdDeadline: "2026-10-01T00:00:00Z" },
      new Date("2026-09-01T00:00:00Z"),
    )
    expect(row.solo!.price).toBe(110)
    expect(row.solo!.basePrice).toBeNull()
  })
})

describe("divisionRowModel — labels", () => {
  it("group uses the authored ageGroup name over season maxAge", () => {
    expect(divisionRowModel(base).group).toBe("U10")
    expect(
      divisionRowModel({ ...base, maxAge: 14, ageGroup: { name: "U6", minAge: 4, maxAge: 6 } })
        .group,
    ).toBe("U6")
  })

  it("group falls back to U{maxAge}, then to empty", () => {
    expect(divisionRowModel({ ...base, ageGroup: null, maxAge: 12 }).group).toBe("U12")
    expect(divisionRowModel({ ...base, ageGroup: null, maxAge: null }).group).toBe("")
  })

  it("group appends the division gender when one is set", () => {
    expect(divisionRowModel({ ...base, divisionGender: "girls" }).group).toBe("U10 girls")
  })

  it("season name drops a trailing group suffix that repeats the group column", () => {
    expect(divisionRowModel(base).seasonName).toBe("Winter 1 2026-27")
    expect(
      divisionRowModel({ ...base, name: "Winter 1 2026-27 - U10" }).seasonName,
    ).toBe("Winter 1 2026-27")
    // A different group in the name is real information — never stripped.
    expect(
      divisionRowModel({ ...base, name: "Winter 1 2026-27 — U12" }).seasonName,
    ).toBe("Winter 1 2026-27 — U12")
    // Nothing to strip.
    expect(
      divisionRowModel({ ...base, name: "Winter 1 2026-27" }).seasonName,
    ).toBe("Winter 1 2026-27")
  })

  it("meta joins day and start date, dropping nulls", () => {
    expect(divisionRowModel(base).meta).toBe("Sat · starts Nov 8")
    expect(divisionRowModel({ ...base, dayOfWeek: null }).meta).toBe("starts Nov 8")
  })
})

describe("divisionRowModel — capacity", () => {
  it("spotsLeft shows only where a solo door exists", () => {
    expect(divisionRowModel({ ...base, spotsLeft: 3 }).spotsLeft).toBe(3)
    expect(divisionRowModel({ ...dual, spotsLeft: 3 }).spotsLeft).toBe(3)
    expect(divisionRowModel(base).spotsLeft).toBeNull()
    // No team-capacity column exists — a team-only row must never print a count.
    expect(divisionRowModel({ ...teamOnly, spotsLeft: 3 }).spotsLeft).toBeNull()
  })

  it("soldOut is honest for every row shape", () => {
    expect(divisionRowModel({ ...base, spotsLeft: 0 }).soldOut).toBe(true)
    const teamSoldOut = divisionRowModel({ ...teamOnly, spotsLeft: 0 })
    expect(teamSoldOut.soldOut).toBe(true)
    expect(teamSoldOut.spotsLeft).toBeNull()
    expect(divisionRowModel({ ...base, spotsLeft: 3 }).soldOut).toBe(false)
    expect(divisionRowModel(base).soldOut).toBe(false)
  })
})
