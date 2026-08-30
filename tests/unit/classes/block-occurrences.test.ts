import { describe, it, expect } from "vitest"
import { blockOccurrenceInstants, blockExpiryInstant } from "@/lib/classes/block-occurrences"

const TPL = { weekday: 2, startTime: "17:00:00", timeZone: "America/New_York" }

describe("blockOccurrenceInstants", () => {
  it("counts every Tuesday in an 8-week window when 'after' precedes the block", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-09-15", endDate: "2026-11-07",
      after: new Date("2026-09-01T00:00:00Z") })
    expect(out).toHaveLength(8) // Sep 15,22,29, Oct 6,13,20,27, Nov 3
    expect(out[0].toISOString()).toBe("2026-09-15T21:00:00.000Z") // EDT −4
  })
  it("prorates: joining mid-block yields only future occurrences", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-09-15", endDate: "2026-11-07",
      after: new Date("2026-10-07T00:00:00Z") })
    expect(out).toHaveLength(4) // Oct 13,20,27, Nov 3
  })
  it("is DST-safe: occurrences after the Nov 1 fallback resolve at EST −5", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-10-25", endDate: "2026-11-10",
      after: new Date("2026-10-20T00:00:00Z") })
    // Oct 27 (EDT) then Nov 3 + Nov 10 (EST)
    expect(out.map((d) => d.toISOString())).toEqual([
      "2026-10-27T21:00:00.000Z",
      "2026-11-03T22:00:00.000Z",
      "2026-11-10T22:00:00.000Z",
    ])
  })
  it("an occurrence at exactly 'after' is excluded (strictly after)", () => {
    const out = blockOccurrenceInstants({ ...TPL, startDate: "2026-09-15", endDate: "2026-09-15",
      after: new Date("2026-09-15T21:00:00Z") })
    expect(out).toHaveLength(0)
  })
})

describe("blockExpiryInstant", () => {
  it("is end-of-day in org tz", () => {
    expect(blockExpiryInstant("2026-11-07", "America/New_York").toISOString())
      .toBe("2026-11-08T04:59:59.000Z") // 23:59:59 EST
  })
})
