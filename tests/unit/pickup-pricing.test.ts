// tests/unit/pickup-pricing.test.ts
import { describe, it, expect } from "vitest"
import { pricingTiers, WALK_IN_RATE_CENTS } from "@/lib/landing/pickup-pricing"

describe("pricingTiers", () => {
  const rate = { defaultSessionRateCents: 1500, defaultMemberRateCents: 1200 }

  it("produces walk-in / online / member with whole-dollar labels", () => {
    const tiers = pricingTiers(rate)
    expect(tiers.map((t) => [t.label, t.amountLabel])).toEqual([
      ["Walk-in", "$17"],
      ["Book online", "$15"],
      ["Member", "$12"],
    ])
  })
  it("marks member as best and shows savings vs walk-in", () => {
    const member = pricingTiers(rate).find((t) => t.label === "Member")!
    expect(member.best).toBe(true)
    expect(member.note).toBe("Save $5 →")
  })
  it("defaults the walk-in figure to WALK_IN_RATE_CENTS", () => {
    expect(WALK_IN_RATE_CENTS).toBe(1700)
    expect(pricingTiers(rate)[0].amountLabel).toBe("$17")
  })
  it("omits the savings note when member is not cheaper", () => {
    const tiers = pricingTiers({ defaultSessionRateCents: 1700, defaultMemberRateCents: 1700 })
    expect(tiers.find((t) => t.label === "Member")!.note).toBeUndefined()
  })
  it("honors a custom walk-in rate via the second arg", () => {
    expect(pricingTiers(rate, 2000)[0].amountLabel).toBe("$20")
  })
})
