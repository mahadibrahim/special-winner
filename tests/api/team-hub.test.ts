import { describe, it, expect, beforeAll } from "vitest";
import { apiFetch, getAdminCookie, getTeamHubCaptainCookie } from "./setup/test-helpers";

/**
 * Team Hub dashboard endpoints (captain-scoped, NOT Stripe-dependent):
 *  - GET  /api/dashboard/teams            — the captain's team list
 *  - GET  /api/dashboard/teams/[id]       — hub detail, captain-only (404 else)
 *  - DELETE .../[token]/invitee           — remove a PENDING invitee (captain)
 *  - POST   .../[token]/remind            — remind unpaid invitees (captain)
 *
 * Fixtures (seed-e2e-tests.ts): a team OWNED by the dedicated TEAM-HUB CAPTAIN
 * test user (adult-self persona, on a real @aspiresportsohio.com alias) in Org A,
 * with two invitees (one pending, one paid — also real aliases). captainUserId is
 * set so these captain-auth'd endpoints resolve without a payment path, so this
 * suite runs on CI (no Stripe) unlike the Stripe-gated team-shares suite. The
 * admin account stands in for a signed-in NON-captain (must get 404, never the
 * team). This suite asserts DB/auth contracts only — it does NOT assert email
 * delivery (that's the separate real-inbox staging pass).
 */

const HUB_TOKEN = "e2e-team-hub-captain-fixture-0001";
const HUB_TEAM_NAME = "E2E Team Hub";
const INVITEE_PAID = "teamhub-mate2@aspiresportsohio.com";

let captainCookie: string;
let adminCookie: string;
let hubTeamId: string;

beforeAll(async () => {
  captainCookie = await getTeamHubCaptainCookie();
  adminCookie = await getAdminCookie();

  // Resolve the hub team id from the captain's list.
  const res = await apiFetch("/api/dashboard/teams", { cookie: captainCookie });
  expect(res.status).toBe(200);
  const { teams } = (await res.json()) as {
    teams: Array<{ id: string; teamName: string }>;
  };
  const hub = teams.find((t) => t.teamName === HUB_TEAM_NAME);
  expect(hub, "seeded Team Hub fixture missing — run npm run db:seed:e2e").toBeTruthy();
  hubTeamId = hub!.id;
});

describe("GET /api/dashboard/teams", () => {
  it("lists the captain's teams with a live payment summary", async () => {
    const res = await apiFetch("/api/dashboard/teams", { cookie: captainCookie });
    expect(res.status).toBe(200);
    const { teams } = (await res.json()) as {
      teams: Array<{
        teamName: string;
        teamFeeCents: number | null;
        collectedCents: number;
        unpaidCount: number;
      }>;
    };
    const hub = teams.find((t) => t.teamName === HUB_TEAM_NAME)!;
    expect(hub.teamFeeCents).toBe(60000);
    // deposit (20000) + one PAID invitee share (20000); pending adds nothing.
    expect(hub.collectedCents).toBe(40000);
    expect(hub.unpaidCount).toBeGreaterThanOrEqual(1);
  });

  it("401s when unauthenticated", async () => {
    const res = await apiFetch("/api/dashboard/teams");
    expect(res.status).toBe(401);
  });
});

describe("GET /api/dashboard/teams/[id]", () => {
  it("returns the full hub detail for the captain", async () => {
    const res = await apiFetch(`/api/dashboard/teams/${hubTeamId}`, {
      cookie: captainCookie,
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.team.teamName).toBe(HUB_TEAM_NAME);
    expect(body.team.invitees.length).toBeGreaterThanOrEqual(2);
    expect(body.payment.collectedCents).toBe(40000);
    // No roster/season set up for a forming team → empty season module.
    expect(body.seasonModule.rosterTeamId).toBeNull();
    expect(body.seasonModule.schedule).toEqual([]);
  });

  it("404s for a signed-in non-captain (never leaks existence)", async () => {
    const res = await apiFetch(`/api/dashboard/teams/${hubTeamId}`, {
      cookie: adminCookie,
    });
    expect(res.status).toBe(404);
  });

  it("401s when unauthenticated", async () => {
    const res = await apiFetch(`/api/dashboard/teams/${hubTeamId}`);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/public/team-registrations/[token]/remind", () => {
  it("reports unpaid invitees for the captain", async () => {
    const res = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/remind`,
      { method: "POST", cookie: captainCookie },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { sent: number; unpaid: number };
    // `sent` depends on email config (0 when MESSAGING is off); `unpaid` is the
    // config-independent signal — the seeded pending invitee must be counted.
    expect(body.unpaid).toBeGreaterThanOrEqual(1);
  });

  it("404s for a non-captain", async () => {
    const res = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/remind`,
      { method: "POST", cookie: adminCookie },
    );
    expect(res.status).toBe(404);
  });

  it("401s when unauthenticated", async () => {
    const res = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/remind`,
      { method: "POST" },
    );
    expect(res.status).toBe(401);
  });
});

describe("DELETE /api/public/team-registrations/[token]/invitee", () => {
  // Work on a freshly-added invitee so the suite never depends on (or mutates)
  // the seeded fixtures across test ordering.
  const ephemeralEmail = `hub-remove-${Date.now()}@test.aspiresports.com`;

  it("removes a pending invitee the captain just added, then 404s on repeat", async () => {
    // Add via the (captain-token) invite endpoint.
    const add = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/invite`,
      {
        method: "POST",
        cookie: captainCookie,
        body: JSON.stringify({ invites: [{ email: ephemeralEmail, shareCents: 1000 }] }),
      },
    );
    expect(add.status).toBe(200);

    // Find its id via the captain-authed hub detail.
    const detailRes = await apiFetch(`/api/dashboard/teams/${hubTeamId}`, {
      cookie: captainCookie,
    });
    const detail = await detailRes.json();
    const row = detail.team.invitees.find(
      (i: { email: string; id: string }) => i.email === ephemeralEmail,
    );
    expect(row?.id).toBeTruthy();

    const del = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/invitee`,
      {
        method: "DELETE",
        cookie: captainCookie,
        body: JSON.stringify({ inviteeId: row.id }),
      },
    );
    expect(del.status).toBe(200);
    expect((await del.json()).removed).toBe(true);

    // Idempotent: already gone → 404.
    const again = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/invitee`,
      {
        method: "DELETE",
        cookie: captainCookie,
        body: JSON.stringify({ inviteeId: row.id }),
      },
    );
    expect(again.status).toBe(404);
  });

  it("409s when removing a PAID invitee (collected money must not vanish)", async () => {
    const detailRes = await apiFetch(`/api/dashboard/teams/${hubTeamId}`, {
      cookie: captainCookie,
    });
    const detail = await detailRes.json();
    const paid = detail.team.invitees.find(
      (i: { email: string; id: string }) => i.email === INVITEE_PAID,
    );
    expect(paid?.id).toBeTruthy();

    const del = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/invitee`,
      {
        method: "DELETE",
        cookie: captainCookie,
        body: JSON.stringify({ inviteeId: paid.id }),
      },
    );
    expect(del.status).toBe(409);
  });

  it("404s for a non-captain", async () => {
    const res = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/invitee`,
      {
        method: "DELETE",
        cookie: adminCookie,
        body: JSON.stringify({ inviteeId: "00000000-0000-0000-0000-000000000000" }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("401s when unauthenticated", async () => {
    const res = await apiFetch(
      `/api/public/team-registrations/${HUB_TOKEN}/invitee`,
      {
        method: "DELETE",
        body: JSON.stringify({ inviteeId: "00000000-0000-0000-0000-000000000000" }),
      },
    );
    expect(res.status).toBe(401);
  });
});
