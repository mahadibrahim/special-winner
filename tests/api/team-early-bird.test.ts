import { describe, it, expect } from "vitest";
import { getAuthCookie } from "./setup/test-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

/**
 * Team early-bird, end to end over HTTP.
 *
 * Aspire's leagues run a TEAM-ONLY early-bird: captains who form a roster before
 * the deadline get a discounted team fee, and solo players never get a discount
 * (discounting solo would encourage free agents over full rosters).
 *
 * The e2e seed's "E2E Adult Team Soccer 2026" carries:
 *   priceCents               12000  ($120 solo, no early-bird)
 *   teamPriceCents          100000  ($1,000 list team fee)
 *   earlyBirdTeamPriceCents  90000  ($900 early-bird team fee)
 *   earlyBirdDeadline       future
 *
 * This asserts the real charge path (the fee snapshotted onto team_registrations
 * and returned by the create endpoint), not just the display value. Regression
 * guard for #392, where a team price living in the per-player field billed solo
 * registrants 8.3x.
 */

// Pin to the seeded season by slug. The shared staging/CI DB accumulates
// seasons, so `seasons[0]` picks a different row depending on what else exists
// (the multi-tenant "always order/filter explicitly" hazard).
const SEASON_SLUG = "e2e-adult-team-soccer-2026";

// The captain's $200 deposit needs Stripe. When Stripe is NOT configured (CI),
// the endpoint degrades gracefully and still returns the snapshotted teamFeeCents
// — that's the path this asserts. With Stripe configured (local dev against
// staging) the deposit intent needs a real saved card and 502s, so skip there.
const stripeConfigured = Boolean(process.env.STRIPE_SECRET_KEY);
const itWithoutStripe = stripeConfigured ? it.skip : it;

async function adultTeamSeason() {
  const res = await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`);
  const body = await res.json();
  const season = (body.seasons ?? []).find(
    (s: { slug?: string }) => s.slug === SEASON_SLUG,
  );
  expect(season?.id, `expected seeded season "${SEASON_SLUG}" — re-seed e2e data`).toBeTruthy();
  return season;
}

describe("team early-bird", () => {
  itWithoutStripe("charges the early-bird TEAM fee while the window is open", async () => {
    const season = await adultTeamSeason();

    const captainCookie = await getAuthCookie(
      "parent@test.aspiresports.com",
      "TestParent123!",
    );

    const stamp = Date.now();
    const res = await fetch(`${BASE}/api/public/team-registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: captainCookie },
      body: JSON.stringify({
        seasonId: season.id,
        teamName: `EarlyBird Test ${stamp}`,
        captainName: "Cap Tain",
        captainEmail: `cap-eb-${stamp}@test.aspiresports.com`,
      }),
    });
    expect(res.status).toBe(200);
    const created = await res.json();

    // The fee is snapshotted onto the team row at creation — this is the number
    // the captain is actually billed, not a display string.
    expect(created.teamFeeCents).toBe(90000); // $900 early-bird, NOT the $1,000 list
  });

  it("quotes the early-bird team fee but leaves the solo price at list", async () => {
    const season = await adultTeamSeason();
    const detail = await (
      await fetch(`${BASE}/api/public/seasons/${season.id}`)
    ).json();
    const s = detail.season;

    // Team: discounted, and flagged as early-bird so the UI can say so.
    expect(s.teamEarlyBirdActive).toBe(true);
    expect(s.effectiveTeamPriceCents).toBe(90000);
    expect(s.teamPriceCents).toBe(100000);

    // Solo: full list price. A team early-bird must never discount the per-player
    // price — that conflation is exactly what caused the Fall 2026 overcharge.
    expect(s.earlyBirdActive).toBe(false);
    expect(s.effectivePriceCents).toBe(s.priceCents);
    expect(s.effectivePriceCents).toBe(12000);
  });
});
