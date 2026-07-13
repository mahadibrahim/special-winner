import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import { getAuthCookie, apiFetch } from "../setup/test-helpers";
import {
  createTestDropInSession,
  resolveDefaultOrgForHttpTests,
} from "../../utils/dropin-helpers";
import { createTestGameContext } from "../../utils/activity-tracking-helpers";
import { createTestHost, createTestHostWithPassword } from "../../utils/host-helpers";

let organizationId: string;
let venueId: string;

beforeAll(async () => {
  ({ organizationId, venueId } = await resolveDefaultOrgForHttpTests());
});

async function adminCookie() {
  return getAuthCookie("admin@test.aspiresports.com", "TestAdmin123!");
}

describe("GET /api/admin/hosts", () => {
  it("lists a created host with status + venueName", async () => {
    const host = await createTestHost({ organizationId, preferredVenueId: venueId });
    const cookie = await adminCookie();

    const res = await apiFetch("/api/admin/hosts", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.hosts.find((h: { userId: string }) => h.userId === host.userId);
    expect(row).toBeTruthy();
    expect(row.status).toBe("active");
    expect(row.venueName).toBeTruthy();
  });
});

describe("PATCH /api/admin/hosts/:id", () => {
  it("pause → host can no longer claim (claim endpoint 403s)", async () => {
    const host = await createTestHostWithPassword({ organizationId, preferredVenueId: venueId });
    const cookie = await adminCookie();

    const patch = await apiFetch(`/api/admin/hosts/${host.profileId}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ status: "paused" }),
    });
    expect(patch.status).toBe(200);
    const patchBody = await patch.json();
    expect(patchBody.status).toBe("paused");

    const hostCookie = await getAuthCookie(host.email, host.password);
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const claim = await apiFetch(`/api/host/games/${ctx.sessionId}/claim`, {
      method: "POST",
      cookie: hostCookie,
    });
    expect(claim.status).toBe(403);
  });

  it("revoke on a host with 2 future hosted sessions unassigns both", async () => {
    const host = await createTestHost({ organizationId, preferredVenueId: venueId });
    const cookie = await adminCookie();

    const sessionA = await createTestDropInSession({ organizationId, venueId });
    const sessionB = await createTestDropInSession({ organizationId, venueId });
    expect(
      (await assignHostToSession({ sessionId: sessionA.sessionId, hostUserId: host.userId })).ok,
    ).toBe(true);
    expect(
      (await assignHostToSession({ sessionId: sessionB.sessionId, hostUserId: host.userId })).ok,
    ).toBe(true);

    const patch = await apiFetch(`/api/admin/hosts/${host.profileId}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ status: "revoked" }),
    });
    expect(patch.status).toBe(200);
    const body = await patch.json();
    expect(body.unassignedSessions).toBe(2);

    const db = getDb();
    for (const sessionId of [sessionA.sessionId, sessionB.sessionId]) {
      const [session] = await db
        .select()
        .from(dropInSessions)
        .where(eq(dropInSessions.id, sessionId));
      expect(session.hostUserId).toBeNull();

      const [comp] = await db
        .select()
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.sessionId, sessionId),
            eq(dropInBookings.userId, host.userId),
            eq(dropInBookings.paymentMethod, "host_comp"),
          ),
        );
      expect(comp.status).toBe("cancelled");
    }
  });

  it("active reactivates a paused host", async () => {
    const host = await createTestHost({
      organizationId,
      preferredVenueId: venueId,
      status: "paused",
    });
    const cookie = await adminCookie();

    const patch = await apiFetch(`/api/admin/hosts/${host.profileId}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ status: "active" }),
    });
    expect(patch.status).toBe(200);
    const body = await patch.json();
    expect(body.status).toBe("active");

    const db = getDb();
    const [profile] = await db
      .select()
      .from(hostProfiles)
      .where(eq(hostProfiles.id, host.profileId));
    expect(profile.status).toBe("active");
  });

  it("cross-org: admin of org A PATCHing a host profile of org B → 404", async () => {
    const otherOrg = await createTestGameContext({});
    const foreignHost = await createTestHost({ organizationId: otherOrg.organizationId });
    const cookie = await adminCookie();

    const res = await apiFetch(`/api/admin/hosts/${foreignHost.profileId}`, {
      method: "PATCH",
      cookie,
      body: JSON.stringify({ status: "paused" }),
    });
    expect(res.status).toBe(404);
  });
});
