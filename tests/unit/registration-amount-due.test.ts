import { describe, it, expect } from "vitest";
import { registrationAmountDueCents } from "@/lib/registrations/amount-due";

/**
 * Deposit-vs-full amount semantics for new registrations.
 *
 * A deposit is only a valid option when it is a genuine partial payment —
 * strictly less than the full amount due. Prod carried a $200 team-sized
 * deposit alongside a $120 solo price; honoring it charged MORE than
 * pay-in-full and the payment step rendered "Remaining $-80.00". An invalid
 * deposit request must silently fall back to the full amount (never error).
 */

const FUTURE = new Date("2026-08-03T12:00:00.000Z");
const NOW = new Date("2026-07-13T00:00:00.000Z");

const baseSeason = {
  earlyBirdDeadline: null,
  earlyBirdPriceCents: null,
  priceCents: 12000,
  depositCents: null,
};

describe("registrationAmountDueCents", () => {
  it("charges the full price for a full registration", () => {
    expect(registrationAmountDueCents(baseSeason, "full", NOW)).toBe(12000);
  });

  it("honors a deposit strictly below the full price", () => {
    expect(
      registrationAmountDueCents({ ...baseSeason, depositCents: 5000 }, "deposit", NOW),
    ).toBe(5000);
  });

  it("falls back to full price when the deposit exceeds the price (the $200-on-$120 prod case)", () => {
    expect(
      registrationAmountDueCents({ ...baseSeason, depositCents: 20000 }, "deposit", NOW),
    ).toBe(12000);
  });

  it("falls back to full price when the deposit equals the price (not a partial payment)", () => {
    expect(
      registrationAmountDueCents({ ...baseSeason, depositCents: 12000 }, "deposit", NOW),
    ).toBe(12000);
  });

  it("falls back to full price when no deposit is configured", () => {
    expect(registrationAmountDueCents(baseSeason, "deposit", NOW)).toBe(12000);
  });

  it("treats a zero/negative deposit as unset", () => {
    expect(
      registrationAmountDueCents({ ...baseSeason, depositCents: 0 }, "deposit", NOW),
    ).toBe(12000);
    expect(
      registrationAmountDueCents({ ...baseSeason, depositCents: -100 }, "deposit", NOW),
    ).toBe(12000);
  });

  it("compares the deposit against the EARLY-BIRD price while the window is live", () => {
    const season = {
      ...baseSeason,
      earlyBirdDeadline: FUTURE,
      earlyBirdPriceCents: 10000,
      depositCents: 11000, // below list ($120) but above early-bird ($100)
    };
    // Deposit is not a partial payment relative to what pay-in-full charges
    // right now — fall back to the early-bird full price.
    expect(registrationAmountDueCents(season, "deposit", NOW)).toBe(10000);
    // A deposit below the early-bird price is still honored.
    expect(
      registrationAmountDueCents({ ...season, depositCents: 5000 }, "deposit", NOW),
    ).toBe(5000);
  });

  it("deposits are never early-bird discounted; full registrations are", () => {
    const season = {
      ...baseSeason,
      earlyBirdDeadline: FUTURE,
      earlyBirdPriceCents: 10000,
      depositCents: 5000,
    };
    expect(registrationAmountDueCents(season, "full", NOW)).toBe(10000);
    expect(registrationAmountDueCents(season, "deposit", NOW)).toBe(5000);
  });
});
