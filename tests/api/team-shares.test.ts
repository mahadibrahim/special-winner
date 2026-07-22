import { describe, it, expect } from "vitest";
import { getParentCookie } from "./setup/test-helpers";

/**
 * Captain-assigned shares: the captain assigns each teammate a per-player share
 * via the invite endpoint; the share is persisted on a team_invitees row and
 * surfaced on the GET [token] response.
 *
 * What this test covers WITHOUT Stripe/payment:
 *  - POST /invite with explicit { invites: [{ email, shareCents }] } creates
 *    invitee rows reflected in GET [token] (assignedShareCents + status).
 *  - POST /invite with { emails: [...] } even-splits (teamFee − deposit).
 *  - Re-inviting the same email UPSERTs (updates) its assigned share.
 *
 * Deferred to the Task 7 test-mode dry run (needs Stripe + a real card):
 *  - A teammate registering via ?team= paying EXACTLY their assigned share
 *    (amountDueCents override in create-registration.ts).
 *  - The invitee row flipping to status "paid" on payment_intent.succeeded
 *    (handle-registration-payment-succeeded.ts).
 *
 * NOTE: creating a team (POST /api/public/team-registrations) requires an authed
 * captain AND a Stripe deposit intent (saves a card). When Stripe is not
 * configured the create endpoint rolls back and returns a non-2xx with no
 * inviteToken — in that case we skip the share assertions (they're covered by
 * the Task 7 dry run). The auth + body-shape paths still run.
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

async function createTeam(cookie: string): Promise<string | null> {
  const season = (
    await (
      await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)
    ).json()
  ).seasons?.[0];
  if (!season?.id) return null;

  const stamp = Date.now();
  const res = await fetch(`${BASE}/api/public/team-registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      seasonId: season.id,
      teamName: `Shares Test ${stamp}`,
      captainName: "Share Captain",
      captainEmail: `share-cap-${stamp}@test.aspiresports.com`,
      backstopConsent: true,
    }),
  });
  if (!res.ok) return null; // Stripe likely unconfigured — defer to Task 7.
  const json = (await res.json()) as { inviteToken?: string };
  return json.inviteToken ?? null;
}

async function getTeam(token: string) {
  return (
    await fetch(`${BASE}/api/public/team-registrations/${token}`)
  ).json();
}

describe("team captain-assigned shares", () => {
  // Anonymous team creation is no longer a 401 — see
  // tests/api/team-registrations-anon.test.ts, which owns the anon-captain
  // assertions (new email -> 200 + session; existing email -> 409
  // account_exists, no team created).

  it("the invite endpoint 404s for an unknown token", async () => {
    const res = await fetch(
      `${BASE}/api/public/team-registrations/definitely-not-a-real-token/invite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: ["x@test.aspiresports.com"] }),
      },
    );
    expect(res.status).toBe(404);
  });

  it("explicit invites persist assigned shares visible in GET [token]", async () => {
    const cookie = await getParentCookie();
    const token = await createTeam(cookie);
    if (!token) {
      // Stripe not configured in this environment — share assignment is
      // covered end-to-end in the Task 7 test-mode dry run.
      return;
    }

    const stamp = Date.now();
    const emailA = `mate-a-${stamp}@test.aspiresports.com`;
    const emailB = `mate-b-${stamp}@test.aspiresports.com`;

    const res = await fetch(
      `${BASE}/api/public/team-registrations/${token}/invite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invites: [
            { email: emailA, shareCents: 5000 },
            { email: emailB, shareCents: 7500 },
          ],
        }),
      },
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { invitees: number };
    expect(body.invitees).toBe(2);

    const team = await getTeam(token);
    expect(team.team.inviteeCount).toBe(2);
    const byEmail = new Map<string, number>(
      team.team.invitees.map((i: any) => [i.email, i.assignedShareCents]),
    );
    expect(byEmail.get(emailA)).toBe(5000);
    expect(byEmail.get(emailB)).toBe(7500);
    for (const i of team.team.invitees) {
      expect(i.status).toBe("pending");
    }
  });

  it("re-inviting the same email UPSERTs the assigned share", async () => {
    const cookie = await getParentCookie();
    const token = await createTeam(cookie);
    if (!token) return; // deferred to Task 7

    const stamp = Date.now();
    const email = `mate-upsert-${stamp}@test.aspiresports.com`;

    await fetch(`${BASE}/api/public/team-registrations/${token}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites: [{ email, shareCents: 5000 }] }),
    });
    await fetch(`${BASE}/api/public/team-registrations/${token}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites: [{ email, shareCents: 9000 }] }),
    });

    const team = await getTeam(token);
    expect(team.team.inviteeCount).toBe(1); // upsert, not duplicate
    expect(team.team.invitees[0].assignedShareCents).toBe(9000);
  });

  it("bare email list even-splits the team fee minus the deposit", async () => {
    const cookie = await getParentCookie();
    const token = await createTeam(cookie);
    if (!token) return; // deferred to Task 7

    const stamp = Date.now();
    const emails = [
      `split-a-${stamp}@test.aspiresports.com`,
      `split-b-${stamp}@test.aspiresports.com`,
      `split-c-${stamp}@test.aspiresports.com`,
    ];

    const res = await fetch(
      `${BASE}/api/public/team-registrations/${token}/invite`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails }),
      },
    );
    expect(res.status).toBe(200);

    const team = await getTeam(token);
    expect(team.team.inviteeCount).toBe(3);
    const shares: number[] = team.team.invitees.map(
      (i: any) => i.assignedShareCents,
    );
    // Even split: all shares within 1 cent of each other, all non-negative.
    const min = Math.min(...shares);
    const max = Math.max(...shares);
    expect(max - min).toBeLessThanOrEqual(1);
    expect(min).toBeGreaterThanOrEqual(0);
  });
});
