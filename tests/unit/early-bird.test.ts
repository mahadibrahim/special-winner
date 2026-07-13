import { describe, it, expect } from "vitest";
import { isEarlyBirdActive, effectivePriceCents } from "@/lib/programs/early-bird";

/**
 * Early-bird pricing semantics.
 *
 * `early_bird_price_cents` is the PER-PLAYER early-bird price — it replaces
 * `price_cents` on individual registrations. It is never a team price: the team
 * charge path (api/public/team-registrations) bills `teamPriceCents` flat and
 * ignores early-bird entirely.
 *
 * Regression: the Fall 2026 seasons were configured with a team early-bird
 * price ($1,000) in this per-player field, while the individual price was $120.
 * Because effectivePriceCents() substituted it unconditionally, every solo
 * registrant was quoted and charged $1,000 instead of $120 (8.3x) across 13
 * live divisions. A per-player early-bird price above the list price is never
 * valid, so we treat it as misconfiguration and fall back to the list price
 * rather than overcharging the customer.
 */

const FUTURE = new Date("2026-08-03T12:00:00.000Z");
const NOW = new Date("2026-07-13T00:00:00.000Z");
const PAST = new Date("2026-07-01T00:00:00.000Z");

describe("isEarlyBirdActive", () => {
  it("is active before the deadline when a valid discount price is set", () => {
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: FUTURE, earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(true);
  });

  it("is inactive after the deadline", () => {
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: PAST, earlyBirdPriceCents: 13000 },
        NOW,
      ),
    ).toBe(false);
  });

  it("is inactive when unset or non-positive", () => {
    expect(
      isEarlyBirdActive({ earlyBirdDeadline: FUTURE, earlyBirdPriceCents: null }, NOW),
    ).toBe(false);
    expect(
      isEarlyBirdActive({ earlyBirdDeadline: null, earlyBirdPriceCents: 13000 }, NOW),
    ).toBe(false);
    expect(
      isEarlyBirdActive({ earlyBirdDeadline: FUTURE, earlyBirdPriceCents: 0 }, NOW),
    ).toBe(false);
  });
});

describe("effectivePriceCents", () => {
  it("charges the early-bird price while the window is open", () => {
    expect(
      effectivePriceCents(
        { earlyBirdDeadline: FUTURE, earlyBirdPriceCents: 13000, priceCents: 15000 },
        NOW,
      ),
    ).toBe(13000);
  });

  it("charges the list price once the window closes", () => {
    expect(
      effectivePriceCents(
        { earlyBirdDeadline: PAST, earlyBirdPriceCents: 13000, priceCents: 15000 },
        NOW,
      ),
    ).toBe(15000);
  });

  // The Fall 2026 regression: a TEAM early-bird price ($1,000) sitting in the
  // per-player field, with a $120 individual list price.
  it("never charges MORE than the list price (team price in the per-player field)", () => {
    expect(
      effectivePriceCents(
        { earlyBirdDeadline: FUTURE, earlyBirdPriceCents: 100000, priceCents: 12000 },
        NOW,
      ),
    ).toBe(12000);
  });

  it("treats an early-bird price equal to the list price as a no-op", () => {
    expect(
      effectivePriceCents(
        { earlyBirdDeadline: FUTURE, earlyBirdPriceCents: 15000, priceCents: 15000 },
        NOW,
      ),
    ).toBe(15000);
  });

  it("reports early-bird as inactive when the price is not a discount", () => {
    // Display twin (season detail endpoint / rail) keys off this, so an
    // "Early-bird ends ..." badge must not show for a misconfigured price.
    expect(
      isEarlyBirdActive(
        { earlyBirdDeadline: FUTURE, earlyBirdPriceCents: 100000, priceCents: 12000 },
        NOW,
      ),
    ).toBe(false);
  });

  it("still reports active when the list price is unknown to the caller", () => {
    // priceCents is optional — callers that don't carry it (pure deadline
    // checks) keep the old deadline-only semantics.
    expect(
      isEarlyBirdActive({ earlyBirdDeadline: FUTURE, earlyBirdPriceCents: 13000 }, NOW),
    ).toBe(true);
  });
});
