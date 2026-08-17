import { describe, it, expect } from "vitest"
import {
  YOUTH_AGE_GROUPS,
  resolveAgeGroup,
} from "@/lib/leagues/youth-age-groups"

describe("YOUTH_AGE_GROUPS", () => {
  it("covers U6 through U19 with no gaps", () => {
    expect(YOUTH_AGE_GROUPS).toHaveLength(14)
    expect(YOUTH_AGE_GROUPS[0].key).toBe("u6")
    expect(YOUTH_AGE_GROUPS[13].key).toBe("u19")
  })

  it("uses the Aug 1 - Jul 31 window for the 2026-27 seasonal year", () => {
    const u10 = YOUTH_AGE_GROUPS.find((g) => g.key === "u10")!
    expect(u10.bornFrom).toBe("2016-08-01")
    expect(u10.bornTo).toBe("2017-07-31")
    expect(u10.label).toBe("U10")
  })

  it("gives every group a human range label", () => {
    const u6 = YOUTH_AGE_GROUPS.find((g) => g.key === "u6")!
    expect(u6.rangeLabel).toBe("Aug 1, 2020 – Jul 31, 2021")
  })
})

describe("resolveAgeGroup", () => {
  it("puts an Aug-Dec birthday in the group starting that year", () => {
    // Born Dec 2016 -> U10 (Aug 1 2016 - Jul 31 2017)
    expect(resolveAgeGroup(12, 2016)?.key).toBe("u10")
  })

  it("puts a Jan-Jul birthday in the group starting the previous year", () => {
    // Born Mar 2017 -> still U10
    expect(resolveAgeGroup(3, 2017)?.key).toBe("u10")
  })

  it("splits a single birth year across two groups", () => {
    // This is the whole point of the 2026-27 change.
    expect(resolveAgeGroup(9, 2017)?.key).toBe("u9")
    expect(resolveAgeGroup(3, 2017)?.key).toBe("u10")
  })

  it("resolves the youngest and oldest groups", () => {
    expect(resolveAgeGroup(8, 2020)?.key).toBe("u6")
    expect(resolveAgeGroup(7, 2008)?.key).toBe("u19")
  })

  it("returns null outside U6-U19", () => {
    expect(resolveAgeGroup(1, 2024)).toBeNull() // too young
    expect(resolveAgeGroup(1, 2000)).toBeNull() // too old
  })
})
