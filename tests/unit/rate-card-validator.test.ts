import { describe, it, expect } from "vitest"
import { validateRateCardPut } from "@/lib/dropin/validators"

describe("validateRateCardPut — walk-up rate", () => {
  it("accepts a non-negative defaultWalkUpRateCents", () => {
    expect(validateRateCardPut({ defaultWalkUpRateCents: 1700 })).toBeNull()
  })
  it("rejects a negative defaultWalkUpRateCents", () => {
    expect(validateRateCardPut({ defaultWalkUpRateCents: -1 })).toMatch(/defaultWalkUpRateCents/)
  })
  it("ignores an omitted defaultWalkUpRateCents", () => {
    expect(validateRateCardPut({ defaultSessionRateCents: 1500 })).toBeNull()
  })
})
