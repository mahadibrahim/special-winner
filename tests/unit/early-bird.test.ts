import { describe, it, expect } from "vitest";
import {
  isEarlyBirdActive,
  effectivePriceCents,
  isTeamEarlyBirdActive,
  effectiveTeamPriceCents,
} from "@/lib/programs/early-bird";

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

/**
 * Team early-bird — Aspire's leagues run a TEAM-only early-bird by policy
 * (solo players pay flat list price on purpose; discounting solo would
 * encourage free agents over full rosters). Independent of the per-player
 * early-bird: a season can run either, both, or neither.
 */
describe("team early-bird", () => {
  const TEAM_LIST = 105000; // $1,050
  const TEAM_EB = 100000; //  $1,000

  it("charges the early-bird team price while the window is open", () => {
    expect(
      effectiveTeamPriceCents(
        { earlyBirdDeadline: FUTURE, earlyBirdTeamPriceCents: TEAM_EB, teamPriceCents: TEAM_LIST },
        TEAM_LIST,
        NOW,
      ),
    ).toBe(TEAM_EB);
  });

  it("charges the list team price once the window closes", () => {
    expect(
      effectiveTeamPriceCents(
        { earlyBirdDeadline: PAST, earlyBirdTeamPriceCents: TEAM_EB, teamPriceCents: TEAM_LIST },
        TEAM_LIST,
        NOW,
      ),
    ).toBe(TEAM_LIST);
  });

  it("charges the list team price when no team early-bird is set", () => {
    expect(
      effectiveTeamPriceCents(
        { earlyBirdDeadline: FUTURE, earlyBirdTeamPriceCents: null, teamPriceCents: TEAM_LIST },
        TEAM_LIST,
        NOW,
      ),
    ).toBe(TEAM_LIST);
  });

  it("never charges MORE than the list team price", () => {
    expect(
      effectiveTeamPriceCents(
        { earlyBirdDeadline: FUTURE, earlyBirdTeamPriceCents: 200000, teamPriceCents: TEAM_LIST },
        TEAM_LIST,
        NOW,
      ),
    ).toBe(TEAM_LIST);
    expect(
      isTeamEarlyBirdActive(
        { earlyBirdDeadline: FUTURE, earlyBirdTeamPriceCents: 200000, teamPriceCents: TEAM_LIST },
        NOW,
      ),
    ).toBe(false);
  });

  it("falls back to the passed list fee when teamPriceCents is null (team price not set)", () => {
    // team-registrations bills `teamPriceCents ?? priceCents`; the guard must
    // compare against that same resolved fee, not against nothing.
    expect(
      effectiveTeamPriceCents(
        { earlyBirdDeadline: FUTURE, earlyBirdTeamPriceCents: 12000, teamPriceCents: null },
        12000, // resolved list fee == the "early-bird" → not a discount
        NOW,
      ),
    ).toBe(12000);
  });

  it("is independent of the per-player early-bird", () => {
    // A team-only early-bird must NOT discount solo. This is the Aspire policy
    // and the exact confusion that caused the Fall 2026 overcharge.
    const season = {
      earlyBirdDeadline: FUTURE,
      earlyBirdPriceCents: null, // no solo early-bird
      earlyBirdTeamPriceCents: TEAM_EB,
      priceCents: 12000, // $120 solo
      teamPriceCents: TEAM_LIST,
    };
    expect(effectivePriceCents(season, NOW)).toBe(12000); // solo pays list
    expect(isEarlyBirdActive(season, NOW)).toBe(false); // no solo early-bird badge
    expect(effectiveTeamPriceCents(season, TEAM_LIST, NOW)).toBe(TEAM_EB); // team discounted
    expect(isTeamEarlyBirdActive(season, NOW)).toBe(true);
  });
});
