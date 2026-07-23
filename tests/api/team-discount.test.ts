import { describe, it, expect } from "vitest";

/**
 * Team reserve-step discount: POST/DELETE
 * /api/public/team-registrations/[token]/discount.
 *
 * The discount reduces the stored team fee (which the roster splits); the $200
 * deposit is unchanged. Only the signed-in captain may change it — the invite
 * token is the shared join link, so a token alone must never authorize a money
 * change. Runs on CI without Stripe: team creation degrades gracefully to a
 * teamless-deposit success that still returns teamFeeCents + a session cookie.
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const SEASON_SLUG = "e2e-adult-team-soccer-2026";
const CODE = "E2ETEAM10"; // seeded 10% code (percentage × 100 = 1000)

async function getTeamSeasonId(): Promise<string> {
  const json = await (await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)).json();
  const season = json.seasons?.find((s: { slug?: string }) => s.slug === SEASON_SLUG);
  expect(season?.id, `expected seeded season "${SEASON_SLUG}" — re-seed e2e data`).toBeTruthy();
  return season.id;
}

/** The first cookie pair (name=value) from a Set-Cookie header, for reuse as a
 *  Cookie request header. */
function sessionCookie(setCookie: string | null): string {
  return (setCookie ?? "").split(";")[0] ?? "";
}

async function createTeam() {
  const seasonId = await getTeamSeasonId();
  const stamp = Date.now();
  const res = await fetch(`${BASE}/api/public/team-registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seasonId,
      teamName: `Discount Test ${stamp}`,
      captainName: "Discount Captain",
      captainEmail: `disc-cap-${stamp}@test.aspiresports.com`,
      backstopConsent: true,
    }),
  });
  expect(res.status, "team create should succeed (Stripe-optional path)").toBe(200);
  const body = (await res.json()) as { inviteToken: string; teamFeeCents: number };
  return {
    token: body.inviteToken,
    teamFeeCents: body.teamFeeCents,
    cookie: sessionCookie(res.headers.get("set-cookie")),
  };
}

describe("team reserve-step discount", () => {
  it("captain applies a code → team fee drops by the discount, deposit untouched", async () => {
    const { token, teamFeeCents, cookie } = await createTeam();
    expect(cookie).toMatch(/auth_session=/);

    const res = await fetch(`${BASE}/api/public/team-registrations/${token}/discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ code: CODE }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { applied: boolean; code?: string; discountCents?: number; teamFeeCents?: number };
    expect(body.applied).toBe(true);
    expect(body.code).toBe(CODE);
    // 10% of the (early-bird) team fee.
    expect(body.discountCents).toBe(Math.round(teamFeeCents * 0.1));
    expect(body.teamFeeCents).toBe(teamFeeCents - Math.round(teamFeeCents * 0.1));
  });

  it("an unknown code is rejected without applying anything", async () => {
    const { token, cookie } = await createTeam();
    const res = await fetch(`${BASE}/api/public/team-registrations/${token}/discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ code: "NOPE-NOT-REAL" }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { applied: boolean; error?: string };
    expect(body.applied).toBe(false);
    expect(body.error).toBeTruthy();
  });

  it("a non-captain (no session) cannot change the team fee", async () => {
    const { token } = await createTeam();
    const res = await fetch(`${BASE}/api/public/team-registrations/${token}/discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }, // no Cookie
      body: JSON.stringify({ code: CODE }),
    });
    expect(res.status).toBe(403);
  });

  it("removing a code restores the full team fee", async () => {
    const { token, teamFeeCents, cookie } = await createTeam();
    await fetch(`${BASE}/api/public/team-registrations/${token}/discount`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify({ code: CODE }),
    });
    const res = await fetch(`${BASE}/api/public/team-registrations/${token}/discount`, {
      method: "DELETE",
      headers: { Cookie: cookie },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { applied: boolean; teamFeeCents?: number };
    expect(body.applied).toBe(false);
    expect(body.teamFeeCents).toBe(teamFeeCents);
  });
});
