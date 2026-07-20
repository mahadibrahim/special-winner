import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { feedbackRequests, dropInBookings, hostRatings, users } from "@/lib/db/schema";
import { generateFeedbackToken, hashFeedbackToken } from "@/lib/feedback/tokens";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import { createTestDropInSession } from "../../utils/dropin-helpers";
import { createTestHost } from "../../utils/host-helpers";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

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
