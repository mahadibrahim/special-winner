import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "@/lib/db";
import { phoneOptIns } from "@/lib/db/schema/phone-verifications";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { createTestUserWithPassword } from "../../utils/host-helpers";

let organizationId: string;

beforeAll(async () => {
  ({ organizationId } = await resolveDefaultOrgForHttpTests());
});

/** Creates a user with a phone + a verified, opted-in phoneOptIns row for the org. */
async function phoneReadyUser() {
  const phone = `+1614555${Math.floor(1000 + Math.random() * 8999)}`;
  const user = await createTestUserWithPassword({ phone });
  const db = getDb();
  await db.insert(phoneOptIns).values({
    organizationId,
    userId: user.userId,
    phone,
    status: "opted_in",
    optedInAt: new Date(),
    optInSource: "registration_form",
  });
  return user;
}

describe("pickup alert subscriptions", () => {
  it("user without phone/opt-in gets 409 phone_required on POST", async () => {
    const user = await createTestUserWithPassword();
    const cookie = await getAuthCookie(user.email, user.password);

    const res = await apiFetch("/api/dropin/alerts/subscriptions", {
      method: "POST",
      cookie,
      body: JSON.stringify({ venueId: null, sport: "soccer" }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("phone_required");
  });

  it("phone-ready user subscribes idempotently and it shows up in GET", async () => {
    const user = await phoneReadyUser();
    const cookie = await getAuthCookie(user.email, user.password);

    const first = await apiFetch("/api/dropin/alerts/subscriptions", {
      method: "POST",
      cookie,
      body: JSON.stringify({ venueId: null, sport: "soccer" }),
    });
    expect(first.status).toBe(200);
    const firstBody = await first.json();
    expect(firstBody.ok).toBe(true);
    expect(firstBody.id).toBeTruthy();

    // Posting the same combo again is idempotent — same row id.
    const second = await apiFetch("/api/dropin/alerts/subscriptions", {
      method: "POST",
      cookie,
      body: JSON.stringify({ venueId: null, sport: "soccer" }),
    });
    expect(second.status).toBe(200);
    const secondBody = await second.json();
    expect(secondBody.id).toBe(firstBody.id);

    const list = await apiFetch("/api/dropin/alerts/subscriptions", { cookie });
    expect(list.status).toBe(200);
    const listBody = await list.json();
    expect(listBody.phoneReady).toBe(true);
    expect(
      listBody.subscriptions.some((s: { id: string }) => s.id === firstBody.id),
    ).toBe(true);
  });

  it("DELETE deactivates; GET no longer shows it; re-POSTing the same combo reactivates the same row", async () => {
    const user = await phoneReadyUser();
    const cookie = await getAuthCookie(user.email, user.password);

    const created = await apiFetch("/api/dropin/alerts/subscriptions", {
      method: "POST",
      cookie,
      body: JSON.stringify({ venueId: null, sport: "futsal" }),
    });
    const { id } = await created.json();

    const del = await apiFetch(`/api/dropin/alerts/subscriptions/${id}`, {
      method: "DELETE",
      cookie,
    });
    expect(del.status).toBe(200);

    const afterDelete = await apiFetch("/api/dropin/alerts/subscriptions", { cookie });
    const afterDeleteBody = await afterDelete.json();
    expect(
      afterDeleteBody.subscriptions.some((s: { id: string }) => s.id === id),
    ).toBe(false);

    // Reactivation: POSTing the same combo again should flip the SAME row
    // back to active rather than inserting a duplicate.
    const reposted = await apiFetch("/api/dropin/alerts/subscriptions", {
      method: "POST",
      cookie,
      body: JSON.stringify({ venueId: null, sport: "futsal" }),
    });
    expect(reposted.status).toBe(200);
    const repostedBody = await reposted.json();
    expect(repostedBody.id).toBe(id);

    const afterRepost = await apiFetch("/api/dropin/alerts/subscriptions", { cookie });
    const afterRepostBody = await afterRepost.json();
    expect(
      afterRepostBody.subscriptions.some(
        (s: { id: string; active: boolean }) => s.id === id && s.active === true,
      ),
    ).toBe(true);
  });

  it("cross-user DELETE 404s", async () => {
    const userA = await phoneReadyUser();
    const cookieA = await getAuthCookie(userA.email, userA.password);
    const userB = await phoneReadyUser();
    const cookieB = await getAuthCookie(userB.email, userB.password);

    const created = await apiFetch("/api/dropin/alerts/subscriptions", {
      method: "POST",
      cookie: cookieA,
      body: JSON.stringify({ venueId: null, sport: "soccer" }),
    });
    const { id } = await created.json();

    const del = await apiFetch(`/api/dropin/alerts/subscriptions/${id}`, {
      method: "DELETE",
      cookie: cookieB,
    });
    expect(del.status).toBe(404);
  });

  it("unauthenticated POST gets 401", async () => {
    const res = await apiFetch("/api/dropin/alerts/subscriptions", {
      method: "POST",
      body: JSON.stringify({ venueId: null, sport: "soccer" }),
    });
    expect(res.status).toBe(401);
  });
});
