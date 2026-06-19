import { describe, it, expect } from "vitest"
import { resolveSeason, resolveHourRateCents, quoteRentalCents } from "@/lib/rentals/soccerone-pricing"

const TZ = "America/New_York"
const utc = (iso: string) => new Date(iso)

describe("soccerone rental pricing", () => {
  it("resolveSeason: Apr–Sep = summer, Oct–Mar = winter", () => {
    expect(resolveSeason(4)).toBe("summer")
    expect(resolveSeason(9)).toBe("summer")
    expect(resolveSeason(10)).toBe("winter")
    expect(resolveSeason(3)).toBe("winter")
    expect(resolveSeason(12)).toBe("winter")
  })

  it("summer weekday tiers (Wed 2026-07-15, EDT = UTC-4)", () => {
    expect(resolveHourRateCents(utc("2026-07-15T14:00:00Z"), TZ)).toBe(11000) // 10:00 ET, before 3
    expect(resolveHourRateCents(utc("2026-07-15T20:00:00Z"), TZ)).toBe(17000) // 16:00 ET, 3–6
    expect(resolveHourRateCents(utc("2026-07-15T23:00:00Z"), TZ)).toBe(19000) // 19:00 ET, after 6
  })

  it("summer weekend is always top tier (Sat 2026-07-18, 10:00 ET = 14:00Z)", () => {
    expect(resolveHourRateCents(utc("2026-07-18T14:00:00Z"), TZ)).toBe(19000)
  })

  it("winter weekday tiers (Wed 2026-01-14, EST = UTC-5)", () => {
    expect(resolveHourRateCents(utc("2026-01-14T15:00:00Z"), TZ)).toBe(13000) // 10:00 ET, before 3
    expect(resolveHourRateCents(utc("2026-01-14T21:00:00Z"), TZ)).toBe(18500) // 16:00 ET, 3–6
    expect(resolveHourRateCents(utc("2026-01-15T01:00:00Z"), TZ)).toBe(26000) // 20:00 ET, after 6
  })

  it("quoteRentalCents sums per hour, crossing the 6pm boundary (summer Wed 5–7pm ET)", () => {
    expect(quoteRentalCents(utc("2026-07-15T21:00:00Z"), utc("2026-07-15T23:00:00Z"), TZ)).toBe(36000)
  })

  it("quoteRentalCents: winter weekend 3 hours = 3 × 26000", () => {
    expect(quoteRentalCents(utc("2026-01-17T22:00:00Z"), utc("2026-01-18T01:00:00Z"), TZ)).toBe(78000)
  })

  it("quoteRentalCents returns 0 when endsAt <= startsAt", () => {
    expect(quoteRentalCents(utc("2026-07-15T21:00:00Z"), utc("2026-07-15T21:00:00Z"), TZ)).toBe(0)
  })

  it("grid slot priced in UTC matches the displayed hour (7pm weekday summer = evening)", () => {
    // Grid builds "7 PM" as 19:00Z; pricing in UTC must see hour 19 → evening $190
    expect(quoteRentalCents(utc("2026-07-15T19:00:00Z"), utc("2026-07-15T20:00:00Z"), "UTC")).toBe(19000)
    // and a "4 PM" slot (16:00Z) → 3–6pm tier $170
    expect(quoteRentalCents(utc("2026-07-15T16:00:00Z"), utc("2026-07-15T17:00:00Z"), "UTC")).toBe(17000)
  })

  it("ET-correct instants price by the local tier (4pm ET summer = midday $170, 7pm = evening $190)", () => {
    // 4 PM EDT = 20:00Z → 5 PM EDT = 21:00Z
    expect(quoteRentalCents(utc("2026-07-15T20:00:00Z"), utc("2026-07-15T21:00:00Z"), "America/New_York")).toBe(17000)
    // 7 PM EDT = 23:00Z → 8 PM EDT = 00:00Z next day
    expect(quoteRentalCents(utc("2026-07-15T23:00:00Z"), utc("2026-07-16T00:00:00Z"), "America/New_York")).toBe(19000)
  })
})
