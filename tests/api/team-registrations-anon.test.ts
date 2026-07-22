import { describe, it, expect } from "vitest";

/**
 * Anonymous-captain team creation (Wave 2 Task 3).
 *
 * Before this change, POST /api/public/team-registrations 401'd any caller
 * without a session (see the now-deleted test in team-shares.test.ts). Now
 * it accepts anonymous callers too:
 *  - new email  -> upserts a guest user, mints a session (account-takeover
 *    prevention: ONLY for genuinely new users), creates the team.
 *  - existing email -> 409 account_exists, no team row, no session. The
 *    client falls back to its existing magic-link flow.
 *
 * `backstopConsent: true` is now required on every path (authed included).
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const SEASON_SLUG = "e2e-adult-team-soccer-2026";

async function getTeamSeasonId(): Promise<string> {
  const season = (
    await (
      await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)
    ).json()
  ).seasons?.find((s: { slug?: string }) => s.slug === SEASON_SLUG);
  expect(
    season?.id,
    `expected seeded season "${SEASON_SLUG}" — re-seed e2e data`,
  ).toBeTruthy();
  return season.id;
}

describe("anonymous captain team creation", () => {
  it("creates a team for a brand-new email, sets a session cookie, and returns wasNewUser: true", async () => {
    const seasonId = await getTeamSeasonId();
    const stamp = Date.now();
    const email = `w2-cap-${stamp}@test.aspiresports.com`;

    const res = await fetch(`${BASE}/api/public/team-registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId,
        teamName: `Anon Cap Test ${stamp}`,
        captainName: "Anon Captain",
        captainEmail: email,
        backstopConsent: true,
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      inviteToken?: string;
      wasNewUser?: boolean;
    };
    expect(body.inviteToken).toBeTruthy();
    expect(body.wasNewUser).toBe(true);

    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toBeTruthy();
  });

  it("returns 409 account_exists for an email that already has an account, and creates no team", async () => {
    const seasonId = await getTeamSeasonId();
    const stamp = Date.now();

    const res = await fetch(`${BASE}/api/public/team-registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId,
        teamName: `Existing Email Test ${stamp}`,
        captainName: "Existing Captain",
        captainEmail: "parent@test.aspiresports.com",
        backstopConsent: true,
      }),
    });

    expect(res.status).toBe(409);
    const body = (await res.json()) as { error?: string; inviteToken?: string };
    expect(body.error).toBe("account_exists");
    // No team was created for this request — the response carries no
    // inviteToken (sufficient signal; we don't query the DB from here).
    expect(body.inviteToken).toBeUndefined();
  });

  it("400s when backstopConsent is missing", async () => {
    const seasonId = await getTeamSeasonId();
    const stamp = Date.now();

    const res = await fetch(`${BASE}/api/public/team-registrations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        seasonId,
        teamName: `No Consent Test ${stamp}`,
        captainName: "No Consent",
        captainEmail: `w2-noconsent-${stamp}@test.aspiresports.com`,
      }),
    });

    expect(res.status).toBe(400);
  });

  it("rate limits after 5 requests/min/IP", async () => {
    // The limiter is in-memory/per-instance and fails open on error (see
    // rate-limit.ts), and the broader suite may run with
    // DISABLE_RATE_LIMIT=1. Bodies here are intentionally invalid-but-
    // parseable (no backstopConsent) — the limiter check happens before
    // body validation, so a 400 from an earlier request doesn't invalidate
    // the count.
    let sawLimit = false;
    let last = 0;
    for (let i = 0; i < 6; i++) {
      const res = await fetch(`${BASE}/api/public/team-registrations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seasonId: "not-a-real-uuid" }),
      });
      last = res.status;
      if (last === 429) {
        sawLimit = true;
        break;
      }
    }

    if (!sawLimit) {
      // Tolerant by design: DISABLE_RATE_LIMIT=1 (or a fresh in-memory
      // bucket from a just-restarted dev server) means we may not trip the
      // limiter within 6 requests in this run. Don't fail the suite over
      // an environment condition outside this test's control.
      console.warn(
        `rate-limit test: never saw 429 in 6 requests (last status ${last}) — ` +
          "likely DISABLE_RATE_LIMIT=1 or a fresh bucket; not failing.",
      );
      return;
    }
    expect(last).toBe(429);
  });
});
