import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  users,
  locations,
  sports,
  programs,
  seasons,
  games,
  gameOfficials,
  feedbackRequests,
  refereeRatings,
} from "@/lib/db/schema";
import { generateFeedbackToken, hashFeedbackToken } from "@/lib/feedback/tokens";

const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";

/** Sent referee-rating request pointing at a real completed game + official. */
async function seedRefereeRequest() {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `RefSubmit ${suffix}`,
      slug: `ref-submit-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();
  const [location] = await db
    .insert(locations)
    .values({ organizationId: org.id, name: `Loc ${suffix}`, slug: `loc-${suffix}` })
    .returning();
  const [sport] = await db
    .insert(sports)
    .values({ organizationId: org.id, name: `Sport ${suffix}`, slug: `sport-${suffix}` })
    .returning();
  const [program] = await db
    .insert(programs)
    .values({
      locationId: location.id,
      sportId: sport.id,
      name: `Program ${suffix}`,
      slug: `program-${suffix}`,
      programType: "league",
    })
    .returning();
  const [season] = await db
    .insert(seasons)
    .values({
      programId: program.id,
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      startDate: "2026-06-01",
      endDate: "2026-08-31",
      priceCents: 10000,
    })
    .returning();
  const [game] = await db
    .insert(games)
    .values({
      seasonId: season.id,
      scheduledAt: new Date(Date.now() - 4 * 60 * 60 * 1000),
      status: "completed",
    })
    .returning();
  const [refUser] = await db
    .insert(users)
    .values({
      email: `refsubmit-ref-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Ref",
      lastName: "User",
    })
    .returning();
  const [official] = await db
    .insert(gameOfficials)
    .values({ gameId: game.id, userId: refUser.id, position: "referee" })
    .returning();
  const [rater] = await db
    .insert(users)
    .values({
      email: `refsubmit-rater-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Rater",
      lastName: "User",
    })
    .returning();

  const token = generateFeedbackToken();
  const [request] = await db
    .insert(feedbackRequests)
    .values({
      organizationId: org.id,
      brand: "aspire",
      kind: "referee_rating",
      targetId: game.id,
      recipientUserId: rater.id,
      gameOfficialId: official.id,
      tokenHash: hashFeedbackToken(token),
      status: "sent",
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "League game", gameType: "league", refereeName: "Ref U." },
    })
    .returning();

  return { token, request, game, refUser };
}

const post = (path: string, body: unknown) =>
  fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /api/feedback/[token]/referee", () => {
  it("saves a rating with denormalized game + referee", async () => {
    const { token, request, game, refUser } = await seedRefereeRequest();

    const res = await post(`/api/feedback/${token}/referee`, {
      overall: 4,
      gameControl: 5,
      communication: 4,
      fairness: 3,
      comment: "Kept the game safe",
    });
    expect(res.status).toBe(200);

    const [row] = await getDb()
      .select()
      .from(refereeRatings)
      .where(eq(refereeRatings.requestId, request.id));
    expect(row.overall).toBe(4);
    expect(row.gameId).toBe(game.id);
    expect(row.refereeUserId).toBe(refUser.id);
    expect(row.comment).toBe("Kept the game safe");
  });

  it("is single-use", async () => {
    const { token } = await seedRefereeRequest();
    const body = { overall: 3, gameControl: 3, communication: 3, fairness: 3 };
    await post(`/api/feedback/${token}/referee`, body);
    const second = await post(`/api/feedback/${token}/referee`, body);
    expect(second.status).toBe(409);
  });

  it("rejects out-of-range dimensions", async () => {
    const { token } = await seedRefereeRequest();
    const res = await post(`/api/feedback/${token}/referee`, {
      overall: 6,
      gameControl: 3,
      communication: 3,
      fairness: 3,
    });
    expect(res.status).toBe(400);
  });

  it("rejects NPS tokens on this endpoint", async () => {
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);
    const [org] = await db
      .insert(organizations)
      .values({ name: `X ${suffix}`, slug: `x-${suffix}`, organizationType: "headquarters" })
      .returning();
    const [user] = await db
      .insert(users)
      .values({ email: `x-${suffix}@test.example`, passwordHash: "x", firstName: "X", lastName: "Y" })
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
      metadata: { eventLabel: "x" },
    });

    const res = await post(`/api/feedback/${token}/referee`, {
      overall: 3,
      gameControl: 3,
      communication: 3,
      fairness: 3,
    });
    expect(res.status).toBe(400);
  });
});
