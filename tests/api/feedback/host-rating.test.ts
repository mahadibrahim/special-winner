import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  feedbackRequests,
  dropInBookings,
  dropInSessions,
  hostRatings,
  users,
  organizations,
  locations,
  venues,
} from "@/lib/db/schema";
import { generateFeedbackToken, hashFeedbackToken } from "@/lib/feedback/tokens";
import { getFeedbackPageData } from "@/lib/feedback/lookup";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import { createTestHost } from "../../utils/host-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

/**
 * Seed a sent nps_drop_in feedback request whose target is a real
 * drop_in_bookings row on a session that (by default) has a host assigned —
 * mirrors what dispatch.ts stamps into metadata for a hosted session.
 */
async function seedHostedNpsRequest(opts?: { withHost?: boolean; noBooking?: boolean }) {
  const db = getDb();
  const withHost = opts?.withHost ?? true;
  const suffix = Math.random().toString(36).slice(2, 10);

  const ctx = await createTestDropInSession({});

  let host: Awaited<ReturnType<typeof createTestHost>> | null = null;
  if (withHost) {
    host = await createTestHost({ organizationId: ctx.organizationId });
    const assigned = await assignHostToSession({
      sessionId: ctx.sessionId,
      hostUserId: host.userId,
    });
    expect(assigned.ok).toBe(true);
  }

  const [rater] = await db
    .insert(users)
    .values({
      email: `host-rating-rater-${suffix}@test.example`,
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
  const [request] = await db
    .insert(feedbackRequests)
    .values({
      organizationId: ctx.organizationId,
      brand: "aspire",
      kind: "nps_drop_in",
      // Missing-booking coverage: point targetId at a booking that doesn't exist.
      targetId: opts?.noBooking ? crypto.randomUUID() : booking.id,
      recipientUserId: rater.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        eventLabel: "Pickup Soccer — test",
        ...(withHost && host ? { hostUserId: host.userId, hostName: host.email } : {}),
      },
    })
    .returning();

  return { token, request, session: ctx, booking, host, rater };
}

function post(path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function runDispatchCron() {
  return fetch(`${BASE}/api/cron/dispatch-feedback-requests`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
}

/**
 * NPS-enabled org + completed drop-in session (ended 3h ago) + one confirmed
 * booking — same shape as dispatch-feedback-requests.test.ts's
 * seedCompletedDropIn, so the real dispatch scan (scanDropIns) picks it up.
 * Optionally assigns a host through the real assignHostToSession() so the
 * left-join + conditional metadata spread in dispatch.ts get genuine
 * coverage instead of hand-seeded metadata.
 */
async function seedCompletedDropInForDispatch(opts?: {
  organizationId?: string;
  venueId?: string;
  withHost?: boolean;
  label?: string;
}) {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  let organizationId = opts?.organizationId;
  let venueId = opts?.venueId;

  if (!organizationId || !venueId) {
    const [org] = await db
      .insert(organizations)
      .values({
        name: `Host Dispatch Org ${suffix}`,
        slug: `host-dispatch-${suffix}`,
        organizationType: "headquarters",
        features: { enableNpsSurveys: true },
      })
      .returning();
    const [location] = await db
      .insert(locations)
      .values({ organizationId: org.id, name: `Loc ${suffix}`, slug: `loc-${suffix}` })
      .returning();
    const [venue] = await db
      .insert(venues)
      .values({ locationId: location.id, name: `Venue ${suffix}` })
      .returning();
    organizationId = org.id;
    venueId = venue.id;
  }

  const [user] = await db
    .insert(users)
    .values({
      email: `host-dispatch-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Dispatch",
      lastName: "Tester",
    })
    .returning();

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  // Leave status at its default ("scheduled") — dispatch's scanDropIns
  // accepts both "scheduled" and "completed", and assignHostToSession
  // below requires "scheduled" (it rejects assigning a host to an already
  // "completed" session), so "scheduled" + a past endsAt satisfies both.
  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId,
      venueId,
      kind: "pickup",
      sportOrClassLabel: opts?.label ?? "Soccer",
      startsAt: new Date(threeHoursAgo.getTime() - 60 * 60 * 1000),
      endsAt: threeHoursAgo,
      capacity: 20,
    })
    .returning();

  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId: session.id,
      userId: user.id,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      brand: "aspire",
    })
    .returning();

  let host: Awaited<ReturnType<typeof createTestHost>> | null = null;
  if (opts?.withHost) {
    host = await createTestHost({ organizationId });
    const assigned = await assignHostToSession({
      sessionId: session.id,
      hostUserId: host.userId,
    });
    expect(assigned.ok).toBe(true);
  }

  return { organizationId, venueId, user, session, booking, host };
}

describe("POST /api/feedback/[token]/score with host rating", () => {
  it("accepts an optional host rating with the NPS score and writes a host_ratings row", async () => {
    const { token, request, session } = await seedHostedNpsRequest();

    const res = await post(`/api/feedback/${token}/score`, {
      score: 9,
      hostRating: 5,
      hostComment: "great vibes",
    });
    expect(res.status).toBe(200);

    const [rating] = await getDb()
      .select()
      .from(hostRatings)
      .where(eq(hostRatings.requestId, request.id));
    expect(rating).toBeDefined();
    expect(rating.rating).toBe(5);
    expect(rating.comment).toBe("great vibes");
    expect(rating.sessionId).toBe(session.sessionId);
    expect(rating.organizationId).toBe(session.organizationId);
  });

  it("rejects out-of-range hostRating", async () => {
    const { token, request } = await seedHostedNpsRequest();

    const res = await post(`/api/feedback/${token}/score`, { score: 8, hostRating: 6 });
    expect(res.status).toBe(400);

    // The NPS claim itself must not have gone through on a rejected body.
    const [reqRow] = await getDb()
      .select()
      .from(feedbackRequests)
      .where(eq(feedbackRequests.id, request.id));
    expect(reqRow.status).toBe("sent");
  });

  it("still works with score only on a hosted request (hostRating omitted)", async () => {
    const { token, request } = await seedHostedNpsRequest();

    const res = await post(`/api/feedback/${token}/score`, { score: 7 });
    expect(res.status).toBe(200);

    const [rating] = await getDb()
      .select()
      .from(hostRatings)
      .where(eq(hostRatings.requestId, request.id));
    expect(rating).toBeUndefined();
  });

  it("ignores hostRating on an unhosted request: 200, no rating row", async () => {
    const { token, request } = await seedHostedNpsRequest({ withHost: false });

    const res = await post(`/api/feedback/${token}/score`, { score: 6, hostRating: 4 });
    expect(res.status).toBe(200);

    const [rating] = await getDb()
      .select()
      .from(hostRatings)
      .where(eq(hostRatings.requestId, request.id));
    expect(rating).toBeUndefined();
  });

  it("skips silently when the request's target booking no longer resolves", async () => {
    const { token, request } = await seedHostedNpsRequest({ noBooking: true });

    const res = await post(`/api/feedback/${token}/score`, { score: 10, hostRating: 5 });
    expect(res.status).toBe(200);

    // NPS score still commits even though the host rating was skipped.
    const [reqRow] = await getDb()
      .select()
      .from(feedbackRequests)
      .where(eq(feedbackRequests.id, request.id));
    expect(reqRow.status).toBe("responded");

    const [rating] = await getDb()
      .select()
      .from(hostRatings)
      .where(eq(hostRatings.requestId, request.id));
    expect(rating).toBeUndefined();
  });
});

describe("dispatch stamps host metadata (real scanDropIns path)", () => {
  it("stamps hostUserId + the host's first name for a hosted session, and neither for an unhosted one", async () => {
    // Two sessions in the SAME org+venue, same dispatch run: one hosted, one
    // not. Exercises the real left join + conditional metadata spread in
    // dispatch.ts's scanDropIns, not hand-seeded metadata.
    const hosted = await seedCompletedDropInForDispatch({ withHost: true, label: "Hosted Soccer" });
    const unhosted = await seedCompletedDropInForDispatch({
      organizationId: hosted.organizationId,
      venueId: hosted.venueId,
      withHost: false,
      label: "Unhosted Soccer",
    });

    const res = await runDispatchCron();
    expect(res.status).toBe(200);

    const db = getDb();
    const [hostedRow] = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "nps_drop_in"),
          eq(feedbackRequests.targetId, hosted.booking.id),
          eq(feedbackRequests.recipientUserId, hosted.user.id),
        ),
      );
    expect(hostedRow).toBeDefined();
    expect(hostedRow.metadata?.hostUserId).toBe(hosted.host?.userId);
    // createTestHost fixtures are always firstName "Test".
    expect(hostedRow.metadata?.hostName).toBe("Test");

    const [unhostedRow] = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "nps_drop_in"),
          eq(feedbackRequests.targetId, unhosted.booking.id),
          eq(feedbackRequests.recipientUserId, unhosted.user.id),
        ),
      );
    expect(unhostedRow).toBeDefined();
    expect(unhostedRow.metadata?.hostUserId).toBeUndefined();
    expect(unhostedRow.metadata?.hostName).toBeUndefined();
  });
});

describe("getFeedbackPageData exposes hostName", () => {
  it("surfaces metadata.hostName on the page view, beside refereeName", async () => {
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);

    const [org] = await db
      .insert(organizations)
      .values({
        name: `Lookup Host Org ${suffix}`,
        slug: `lookup-host-${suffix}`,
        organizationType: "headquarters",
        features: { enableNpsSurveys: true },
      })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        email: `lookup-host-${suffix}@test.example`,
        passwordHash: "x",
        firstName: "Lookup",
        lastName: "Tester",
      })
      .returning();

    const token = generateFeedbackToken();
    await db.insert(feedbackRequests).values({
      organizationId: org.id,
      brand: "aspire",
      kind: "nps_drop_in",
      targetId: crypto.randomUUID(),
      recipientUserId: user.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: {
        eventLabel: "Pickup Soccer — lookup test",
        hostUserId: crypto.randomUUID(),
        hostName: "Coach Alex",
      },
    });

    const data = await getFeedbackPageData(token);
    expect(data.state).toBe("open");
    expect(data.hostName).toBe("Coach Alex");
  });

  it("returns undefined hostName for a request with no host metadata", async () => {
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);

    const [org] = await db
      .insert(organizations)
      .values({
        name: `Lookup No-Host Org ${suffix}`,
        slug: `lookup-no-host-${suffix}`,
        organizationType: "headquarters",
        features: { enableNpsSurveys: true },
      })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        email: `lookup-no-host-${suffix}@test.example`,
        passwordHash: "x",
        firstName: "NoHost",
        lastName: "Tester",
      })
      .returning();

    const token = generateFeedbackToken();
    await db.insert(feedbackRequests).values({
      organizationId: org.id,
      brand: "aspire",
      kind: "nps_drop_in",
      targetId: crypto.randomUUID(),
      recipientUserId: user.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Pickup Soccer — no host" },
    });

    const data = await getFeedbackPageData(token);
    expect(data.state).toBe("open");
    expect(data.hostName).toBeUndefined();
  });
});
