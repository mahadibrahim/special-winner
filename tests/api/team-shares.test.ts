import { describe, it, expect } from "vitest";

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
 * NOTE: creating a team (POST /api/public/team-registrations) requires an
 * authed captain AND a Stripe deposit intent (saves a card). When Stripe is
 * not configured the create endpoint rolls back and returns a non-2xx with no
 * inviteToken — in that case we skip the share assertions (they're covered by
 * the Task 7 dry run). The auth + body-shape paths still run.
 *
 * createTeam mints its OWN fresh captain account (anonymous-captain path,
 * new stamped email) rather than authenticating as the shared
 * parent@test.aspiresports.com fixture user. That fixture user's Stripe
 * customer was created (idempotency key `${userId}:stripe-customer:v1`,
 * see saved-cards.ts) against some earlier email and this dev/staging Stripe
 * account now rejects every subsequent deposit-intent call for that same
 * user id with a different email — a same-key-different-params idempotency
 * conflict, not a Stripe-unconfigured condition. It was silently degrading
 * every test in this file to its `if (!token) return` no-op path. A fresh
 * per-call userId (and thus a fresh idempotency key) sidesteps it — see the
 * already-reliable pattern in team-registrations-anon.test.ts.
 */

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

// Pin to the seeded open team season by slug (same fixture
// team-registrations-anon.test.ts uses). `seasons?.[0]` previously picked
// whichever season the seed happened to list first, which can be a closed
// one (data drift over time) — that silently no-ops every Stripe-dependent
// test below via the `if (!token) return` early-out, without any signal
// that they weren't actually exercising anything.
const TEAM_SEASON_SLUG = "e2e-adult-team-soccer-2026";

async function getTeamSeasonId(): Promise<string | null> {
  const seasons = (
    await (
      await fetch(`${BASE}/api/public/seasons?sport=soccer&audience=adult`)
    ).json()
  ).seasons;
  const season =
    seasons?.find((s: { slug?: string }) => s.slug === TEAM_SEASON_SLUG) ??
    seasons?.[0];
  return season?.id ?? null;
}

async function createTeam(): Promise<
  { token: string; cookie: string } | null
> {
  const seasonId = await getTeamSeasonId();
  if (!seasonId) return null;

  const stamp = Date.now();
  const res = await fetch(`${BASE}/api/public/team-registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seasonId,
      teamName: `Shares Test ${stamp}`,
      captainName: "Share Captain",
      captainEmail: `share-cap-${stamp}@test.aspiresports.com`,
      backstopConsent: true,
    }),
  });
  if (!res.ok) return null; // Stripe likely unconfigured — defer to Task 7.
  const json = (await res.json()) as { inviteToken?: string };
  const cookie = res.headers.get("set-cookie");
  if (!json.inviteToken || !cookie) return null;
  return { token: json.inviteToken, cookie };
}

async function getTeam(token: string, cookie?: string) {
  return (
    await fetch(`${BASE}/api/public/team-registrations/${token}`, {
      headers: cookie ? { Cookie: cookie } : undefined,
    })
  ).json();
}

/**
 * Mints a fresh authed session for a brand-new email via the anonymous-
 * captain team creation path (see team-registrations-anon.test.ts) — cheaper
 * than a full signup, and we only need *a* session tied to a known email.
 * The throwaway team it creates is irrelevant to the caller.
 */
async function mintViewerSession(
  email: string,
): Promise<string> {
  const seasonId = await getTeamSeasonId();
  const stamp = Date.now();
  const res = await fetch(`${BASE}/api/public/team-registrations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      seasonId,
      teamName: `Viewer Throwaway ${stamp}`,
      captainName: "Throwaway Captain",
      captainEmail: email,
      backstopConsent: true,
    }),
  });
  expect(res.status).toBe(200);
  const setCookie = res.headers.get("set-cookie");
  expect(setCookie).toBeTruthy();
  return setCookie!;
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
    const created = await createTeam();
    if (!created) {
      // Stripe not configured in this environment — share assignment is
      // covered end-to-end in the Task 7 test-mode dry run.
      return;
    }
    const { token, cookie } = created;

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

    // Captain-authed: full invitees array (privacy scope-down is captain-only).
    const team = await getTeam(token, cookie);
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
    const created = await createTeam();
    if (!created) return; // deferred to Task 7
    const { token, cookie } = created;

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

    const team = await getTeam(token, cookie);
    expect(team.team.inviteeCount).toBe(1); // upsert, not duplicate
    expect(team.team.invitees[0].assignedShareCents).toBe(9000);
  });

  it("bare email list even-splits the team fee minus the deposit", async () => {
    const created = await createTeam();
    if (!created) return; // deferred to Task 7
    const { token, cookie } = created;

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

    const team = await getTeam(token, cookie);
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

  /**
   * Privacy scope-down (team-clarity PR 2 Task 1): the invite list is
   * captain-only. Anyone else — anonymous or an authed non-captain — gets
   * empty invitees arrays and, if they can be identified as one specific
   * invitee, a `viewerShare` scoped to just their own row.
   */
  it("anonymous GET returns empty invitees arrays, a correct inviteeCount, and a null viewerShare", async () => {
    const created = await createTeam();
    if (!created) return; // Stripe not configured — deferred to Task 7
    const { token } = created;

    const stamp = Date.now();
    const email = `anon-view-${stamp}@test.aspiresports.com`;
    await fetch(`${BASE}/api/public/team-registrations/${token}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ invites: [{ email, shareCents: 4200 }] }),
    });

    const team = await getTeam(token); // no cookie — anonymous
    expect(team.team.inviteeCount).toBe(1); // aggregate stays public
    expect(team.team.invitees).toEqual([]);
    expect(team.payment.invitees).toEqual([]);
    expect(team.viewerShare).toBeNull();
  });

  it("authed non-captain whose email matches an invitee sees only their own viewerShare", async () => {
    const created = await createTeam();
    if (!created) return; // Stripe not configured — deferred to Task 7
    const { token } = created;

    const stamp = Date.now();
    const viewerEmail = `mate-viewer-${stamp}@test.aspiresports.com`;
    const otherEmail = `mate-other-${stamp}@test.aspiresports.com`;

    await fetch(`${BASE}/api/public/team-registrations/${token}/invite`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invites: [
          { email: viewerEmail, shareCents: 6300 },
          { email: otherEmail, shareCents: 7100 },
        ],
      }),
    });

    const viewerCookie = await mintViewerSession(viewerEmail);

    const team = await getTeam(token, viewerCookie);
    expect(team.team.invitees).toEqual([]); // not the captain — no list
    expect(team.payment.invitees).toEqual([]);
    expect(team.viewerShare).toEqual({ shareCents: 6300, status: "pending" });
  });

  // The `?invitee=<uuid>` ref path (for a viewer who isn't authed as the
  // matching email — e.g. clicking their personal invite-email link) can't
  // be exercised yet: the invite POST response doesn't return per-invitee
  // ids for the test to mint a real ref against. Task 2 adds `inviteeIds`
  // to that response; complete this assertion there.
  it.todo(
    "?invitee=<uuid> ref resolves viewerShare for an anonymous caller (needs Task 2's inviteeIds)",
  );
});
