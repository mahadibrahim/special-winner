import { describe, it, expect } from "vitest"
import { zonedHourToUtc } from "@/lib/activity-tracking/tz-day"

const TZ = "America/New_York"

describe("zonedHourToUtc", () => {
  it("summer EDT (UTC-4): 4 PM ET on 2026-07-15 = 20:00Z", () => {
    expect(zonedHourToUtc("2026-07-15", 16, TZ).toISOString()).toBe("2026-07-15T20:00:00.000Z")
  })
  it("summer EDT: 7 PM ET = 23:00Z", () => {
    expect(zonedHourToUtc("2026-07-15", 19, TZ).toISOString()).toBe("2026-07-15T23:00:00.000Z")
  })
  it("winter EST (UTC-5): 4 PM ET on 2026-01-14 = 21:00Z", () => {
    expect(zonedHourToUtc("2026-01-14", 16, TZ).toISOString()).toBe("2026-01-14T21:00:00.000Z")
  })
  it("midnight: hour 0 ET on 2026-07-15 = 04:00Z (EDT)", () => {
    expect(zonedHourToUtc("2026-07-15", 0, TZ).toISOString()).toBe("2026-07-15T04:00:00.000Z")
  })
})
