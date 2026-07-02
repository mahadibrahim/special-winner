import { describe, it, expect } from "vitest";
import { getDb } from "@/lib/db";
import { organizations, users, feedbackRequests, npsResponses } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { generateFeedbackToken, hashFeedbackToken } from "@/lib/feedback/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

/** Seed a sent NPS request and return its plaintext token. */
async function seedNpsRequest(opts?: {
  expired?: boolean;
  reviewUrl?: string;
  kind?: "nps_drop_in" | "referee_rating";
}) {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Fb Submit Org ${suffix}`,
      slug: `fb-submit-${suffix}`,
      organizationType: "headquarters",
      features: { enableNpsSurveys: true },
      settings: {
        branding: { primaryColor: "#000000" },
        contact: { supportEmail: `staff-${suffix}@test.example` },
        payments: { currency: "usd" },
        registration: {},
        notifications: {},
        feedback: opts?.reviewUrl
          ? { googleReviewUrl: { aspire: opts.reviewUrl } }
          : undefined,
      },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `fb-submit-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Submit",
      lastName: "Tester",
    })
    .returning();

  const token = generateFeedbackToken();
  const [request] = await db
    .insert(feedbackRequests)
    .values({
      organizationId: org.id,
      brand: "aspire",
      kind: opts?.kind ?? "nps_drop_in",
      targetId: crypto.randomUUID(),
      recipientUserId: user.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + (opts?.expired ? -1 : 1) * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Pickup Soccer — test" },
    })
    .returning();

  return { token, request, org, user };
}

function post(path: string, body?: unknown) {
  return fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("POST /api/feedback/[token]/score", () => {
  it("saves a promoter score and returns the brand review URL", async () => {
    const { token, request } = await seedNpsRequest({
      reviewUrl: "https://g.page/r/test/review",
    });

    const res = await post(`/api/feedback/${token}/score`, { score: 10 });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.category).toBe("promoter");
    expect(json.reviewUrl).toBe("https://g.page/r/test/review");

    const db = getDb();
    const [row] = await db
      .select()
      .from(npsResponses)
      .where(eq(npsResponses.requestId, request.id));
    expect(row.score).toBe(10);

    const [reqRow] = await db
      .select()
      .from(feedbackRequests)
      .where(eq(feedbackRequests.id, request.id));
    expect(reqRow.status).toBe("responded");
  });

  it("returns null reviewUrl for a promoter when no URL is configured", async () => {
    const { token } = await seedNpsRequest();
    const res = await post(`/api/feedback/${token}/score`, { score: 9 });
    const json = await res.json();
    expect(json.category).toBe("promoter");
    expect(json.reviewUrl).toBeNull();
  });

  it("is single-use", async () => {
    const { token } = await seedNpsRequest();
    await post(`/api/feedback/${token}/score`, { score: 5 });
    const second = await post(`/api/feedback/${token}/score`, { score: 10 });
    expect(second.status).toBe(409);
  });

  it("rejects expired links with 410", async () => {
    const { token } = await seedNpsRequest({ expired: true });
    const res = await post(`/api/feedback/${token}/score`, { score: 10 });
    expect(res.status).toBe(410);
  });

  it("rejects out-of-range scores", async () => {
    const { token } = await seedNpsRequest();
    const res = await post(`/api/feedback/${token}/score`, { score: 11 });
    expect(res.status).toBe(400);
  });

  it("404s an unknown token", async () => {
    const res = await post(`/api/feedback/${generateFeedbackToken()}/score`, { score: 5 });
    expect(res.status).toBe(404);
  });

  it("rejects referee-rating tokens with 400 and leaves them claimable", async () => {
    const { token, request } = await seedNpsRequest({ kind: "referee_rating" });
    const res = await post(`/api/feedback/${token}/score`, { score: 10 });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toBe("This link is a referee rating, not a survey");

    // The token must never be claimed by this endpoint — Task 13's referee
    // endpoint owns it.
    const [reqRow] = await getDb()
      .select()
      .from(feedbackRequests)
      .where(eq(feedbackRequests.id, request.id));
    expect(reqRow.status).toBe("sent");
    expect(reqRow.respondedAt).toBeNull();
  });
});

describe("POST /api/feedback/[token]/comment and review-click", () => {
  it("attaches a comment after the score", async () => {
    const { token, request } = await seedNpsRequest();
    await post(`/api/feedback/${token}/score`, { score: 4 });
    const res = await post(`/api/feedback/${token}/comment`, {
      comment: "Fields were muddy",
    });
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(npsResponses)
      .where(eq(npsResponses.requestId, request.id));
    expect(row.comment).toBe("Fields were muddy");
  });

  it("rejects a comment before any score", async () => {
    const { token } = await seedNpsRequest();
    const res = await post(`/api/feedback/${token}/comment`, { comment: "hi" });
    expect(res.status).toBe(409);
  });

  it("records the review click once", async () => {
    const { token, request } = await seedNpsRequest({
      reviewUrl: "https://g.page/r/test/review",
    });
    await post(`/api/feedback/${token}/score`, { score: 10 });
    const res = await post(`/api/feedback/${token}/review-click`);
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(npsResponses)
      .where(eq(npsResponses.requestId, request.id));
    expect(row.reviewLinkClickedAt).not.toBeNull();
  });
});
