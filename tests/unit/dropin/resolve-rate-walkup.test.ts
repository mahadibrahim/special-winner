import { describe, it, expect } from "vitest"
import { resolveRate, type RateCard, type SessionRateOverrides, type MembershipForPricing } from "@/lib/dropin/pricing"

const rateCard: RateCard = {
  defaultSessionRateCents: 1500,
  defaultMemberRateCents: 1200,
  defaultWalkUpRateCents: 1700,
}
const plainSession: SessionRateOverrides = { sessionRateCents: null, memberRateCents: null, walkUpRateCents: null }
const user = { id: "u1" }

describe("resolveRate — channel-aware walk-up pricing", () => {
  it("non-member online (default source) pays the session rate", () => {
    expect(resolveRate(plainSession, null, null, rateCard).amountCents).toBe(1500)
  })

  it("non-member walk_up pays the walk-up rate", () => {
    expect(resolveRate(plainSession, null, null, rateCard, "walk_up").amountCents).toBe(1700)
  })

  it("explicit online_booking source still pays the session rate", () => {
    expect(resolveRate(plainSession, null, null, rateCard, "online_booking").amountCents).toBe(1500)
  })

  it("per-session walkUpRateCents overrides the org default", () => {
    const s: SessionRateOverrides = { sessionRateCents: null, memberRateCents: null, walkUpRateCents: 2000 }
    expect(resolveRate(s, null, null, rateCard, "walk_up").amountCents).toBe(2000)
  })

  it("member with unlimited_pickup is free regardless of source", () => {
    const m: MembershipForPricing = { id: "m1", tier: { benefits: { unlimited_pickup: true } }, allotmentRemaining: 0 }
    expect(resolveRate(plainSession, user, m, rateCard, "walk_up").amountCents).toBe(0)
    expect(resolveRate(plainSession, user, m, rateCard).amountCents).toBe(0)
  })

  it("member with allotment remaining is free regardless of source", () => {
    const m: MembershipForPricing = { id: "m1", tier: { benefits: {} }, allotmentRemaining: 2 }
    expect(resolveRate(plainSession, user, m, rateCard, "walk_up").amountCents).toBe(0)
  })

  it("member out of allotment pays the member rate, NOT walk-up, even at walk_up", () => {
    const m: MembershipForPricing = { id: "m1", tier: { benefits: {} }, allotmentRemaining: 0 }
    expect(resolveRate(plainSession, user, m, rateCard, "walk_up").amountCents).toBe(1200)
  })
})
