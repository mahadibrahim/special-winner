import { describe, it, expect, beforeAll } from "vitest";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { createTestDropInSession, resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestHostWithPassword } from "../../utils/host-helpers";

let organizationId: string;
let venueId: string;

beforeAll(async () => {
  ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
});

async function hostCookie() {
  const host = await createTestHostWithPassword({ organizationId, preferredVenueId: venueId });
  return { host, cookie: await getAuthCookie(host.email, host.password) };
}

describe("host claim/unclaim", () => {
  it("active host claims an unhosted game; it appears in mine; unclaim releases it", async () => {
    const { cookie } = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId });

    const claim = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie,
    });
    expect(claim.status).toBe(200);

    const list = await apiFetch(`/api/host/games`, { cookie });
    expect(list.status).toBe(200);
    const body = await list.json();
    expect(body.mine.map((g: { id: string }) => g.id)).toContain(ctx.sessionId);

    const unclaim = await apiFetch(`/api/host/games/${ctx.sessionId}/unclaim`, {
      method: "POST",
      cookie,
    });
    expect(unclaim.status).toBe(200);
  });

  it("claim race: two hosts, one winner", async () => {
    const a = await hostCookie();
    const b = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId });

    const [resA, resB] = await Promise.all([
      apiFetch(`/api/host/games/${ctx.sessionId}/claim`, { method: "POST", cookie: a.cookie }),
      apiFetch(`/api/host/games/${ctx.sessionId}/claim`, { method: "POST", cookie: b.cookie }),
    ]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([200, 409]);
  });

  it("claiming a FULL game still succeeds (host comp bypasses capacity)", async () => {
    const { cookie } = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId, capacity: 0 });
    const res = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie,
    });
    expect(res.status).toBe(200);
  });

  it("paused host gets 403; plain parent gets 403", async () => {
    const paused = await createTestHostWithPassword({ organizationId, status: "paused" });
    const pausedCookie = await getAuthCookie(paused.email, paused.password);
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const res = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie: pausedCookie,
    });
    expect(res.status).toBe(403);

    const parentCookie = await getAuthCookie("parent@test.aspiresports.com", "TestParent123!");
    const res2 = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie: parentCookie,
    });
    expect(res2.status).toBe(403);
  });

  it("unclaim past the cancel-window cutoff 409s", async () => {
    const { cookie } = await hostCookie();
    // Session starting in 1 hour — inside the default 24h cancel window.
    const ctx = await createTestDropInSession({
      organizationId,
      venueId,
      startsAt: new Date(Date.now() + 60 * 60 * 1000),
    });
    const claim = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie,
    });
    expect(claim.status).toBe(200);
    const unclaim = await apiFetch(`/api/host/games/${ctx.sessionId}/unclaim`, {
      method: "POST",
      cookie,
    });
    expect(unclaim.status).toBe(409);
    expect((await unclaim.json()).code).toBe("cutoff_passed");
  });

  it("unclaim 404s conflate three distinct cases: nonexistent session, cross-org session, and someone else's session", async () => {
    const a = await hostCookie();
    const b = await hostCookie();
    const ctx = await createTestDropInSession({ organizationId, venueId });
    await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, { method: "POST", cookie: a.cookie });

    // Case 1 — session hosted by someone else (host B unclaiming host A's game).
    const res = await apiFetch(`/api/host/games/${ctx.sessionId}/unclaim`, {
      method: "POST",
      cookie: b.cookie,
    });
    expect(res.status).toBe(404);

    // Case 2 — session id that doesn't exist at all.
    const nonexistentRes = await apiFetch(
      `/api/host/games/00000000-0000-0000-0000-000000000000/unclaim`,
      { method: "POST", cookie: a.cookie },
    );
    expect(nonexistentRes.status).toBe(404);

    // Case 3 — session that exists but belongs to a different org (createTestDropInSession
    // with no organizationId/venueId spins up a fresh org via createTestGameContext).
    const otherOrgCtx = await createTestDropInSession({});
    const crossOrgRes = await apiFetch(`/api/host/games/${otherOrgCtx.sessionId}/unclaim`, {
      method: "POST",
      cookie: a.cookie,
    });
    expect(crossOrgRes.status).toBe(404);
  });
});
