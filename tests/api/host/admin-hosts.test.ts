import { describe, it, expect, beforeAll } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { feedbackRequests, users } from "@/lib/db/schema";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import { generateFeedbackToken, hashFeedbackToken } from "@/lib/feedback/tokens";
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

  it("every host row carries avgRating (null|number) and ratingCount (number)", async () => {
    await createTestHost({ organizationId, preferredVenueId: venueId });
    const cookie = await adminCookie();

    const res = await apiFetch("/api/admin/hosts", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.hosts)).toBe(true);
    expect(body.hosts.length).toBeGreaterThan(0);
    for (const row of body.hosts) {
      expect(row.avgRating === null || typeof row.avgRating === "number").toBe(true);
      expect(typeof row.ratingCount).toBe("number");
    }
  });

  it("reflects a real host_ratings row written via the score endpoint", async () => {
    const host = await createTestHost({ organizationId, preferredVenueId: venueId });
    const ctx = await createTestDropInSession({ organizationId, venueId });
    const assigned = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(assigned.ok).toBe(true);

    const suffix = Math.random().toString(36).slice(2, 10);
    const db = getDb();
    const [rater] = await db
      .insert(users)
      .values({
        email: `admin-hosts-rater-${suffix}@test.example`,
        passwordHash: "x",
        firstName: "Rater",
        lastName: "Tester",
      })
      .returning();

    const [booking] = await db
      .insert(dropInBookings)
      .values({
        sessionId: ctx.sessionId,
        userId: rater.id,
        status: "confirmed",
        source: "online_booking",
        paymentMethod: "card_online",
        amountPaidCents: 1000,
      })
      .returning();

    const token = generateFeedbackToken();
    await db.insert(feedbackRequests).values({
      organizationId,
      brand: "aspire",
      kind: "nps_drop_in",
      targetId: booking.id,
      recipientUserId: rater.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Pickup Soccer — test", hostUserId: host.userId, hostName: host.email },
    });

    const scoreRes = await fetch(
      `${process.env.TEST_BASE_URL ?? "http://localhost:4321"}/api/feedback/${token}/score`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ score: 9, hostRating: 4, hostComment: "solid host" }),
      },
    );
    expect(scoreRes.status).toBe(200);

    const cookie = await adminCookie();
    const res = await apiFetch("/api/admin/hosts", { cookie });
    expect(res.status).toBe(200);
    const body = await res.json();
    const row = body.hosts.find((h: { userId: string }) => h.userId === host.userId);
    expect(row).toBeTruthy();
    expect(row.avgRating).toBe(4);
    expect(row.ratingCount).toBe(1);
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
