import { describe, it, expect } from "vitest";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  organizations,
  users,
  feedbackRequests,
  dropInSessions,
  dropInBookings,
  venues,
  locations,
} from "@/lib/db/schema";

const ENDPOINT = "/api/cron/dispatch-feedback-requests";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

function runCron(secret = CRON_SECRET) {
  return fetch(`${BASE}${ENDPOINT}`, {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
}

/** Org with NPS enabled + a user + a completed drop-in session with one confirmed booking. */
async function seedCompletedDropIn() {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Feedback Org ${suffix}`,
      slug: `fb-org-${suffix}`,
      organizationType: "headquarters",
      features: { enableNpsSurveys: true },
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `fb-test-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Feedback",
      lastName: "Tester",
    })
    .returning();

  // venues.locationId is NOT NULL — seed a location first (see
  // src/lib/db/schema/teams.ts:57 / organizations.ts:161).
  const [location] = await db
    .insert(locations)
    .values({
      organizationId: org.id,
      name: `Loc ${suffix}`,
      slug: `loc-${suffix}`,
    })
    .returning();

  const [venue] = await db
    .insert(venues)
    .values({
      locationId: location.id,
      name: `Venue ${suffix}`,
    })
    .returning();

  const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId: org.id,
      venueId: venue.id,
      kind: "pickup",
      sportOrClassLabel: "Soccer",
      startsAt: new Date(threeHoursAgo.getTime() - 60 * 60 * 1000),
      endsAt: threeHoursAgo,
      capacity: 20,
      status: "completed",
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

  return { org, user, session, booking };
}

describe("POST /api/cron/dispatch-feedback-requests", () => {
  it("rejects a missing/bad cron secret", async () => {
    const res = await runCron("wrong-secret");
    expect(res.status).toBe(401);
  });

  it("creates + sends one NPS request for a completed drop-in booking, idempotently", async () => {
    const { user, booking } = await seedCompletedDropIn();

    const first = await runCron();
    expect(first.status).toBe(200);

    const db = getDb();
    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "nps_drop_in"),
          eq(feedbackRequests.targetId, booking.id),
          eq(feedbackRequests.recipientUserId, user.id),
        ),
      );
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("sent");
    expect(rows[0].metadata?.eventLabel).toContain("Soccer");

    // Second run must not create a duplicate.
    await runCron();
    const again = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.kind, "nps_drop_in"),
          eq(feedbackRequests.targetId, booking.id),
        ),
      );
    expect(again.length).toBe(1);
  });

  it("respects the 90-day cooldown per kind", async () => {
    const { org, user } = await seedCompletedDropIn();
    const db = getDb();

    // Pretend this user already got a drop-in NPS ask 10 days ago.
    await db.insert(feedbackRequests).values({
      organizationId: org.id,
      brand: "aspire",
      kind: "nps_drop_in",
      targetId: crypto.randomUUID(),
      recipientUserId: user.id,
      tokenHash: `cooldown-${Math.random().toString(36).slice(2)}`,
      status: "sent",
      sentAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      expiresAt: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000),
      metadata: { eventLabel: "Earlier session" },
    });

    await runCron();

    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(
          eq(feedbackRequests.recipientUserId, user.id),
          eq(feedbackRequests.kind, "nps_drop_in"),
        ),
      );
    // Only the pre-seeded row — the new booking was skipped by cooldown.
    expect(rows.length).toBe(1);
  });

  it("does nothing for orgs without enableNpsSurveys", async () => {
    const { org, user } = await seedCompletedDropIn();
    const db = getDb();
    await db
      .update(organizations)
      .set({ features: { enableNpsSurveys: false } })
      .where(eq(organizations.id, org.id));

    await runCron();

    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(eq(feedbackRequests.recipientUserId, user.id));
    expect(rows.length).toBe(0);
  });
});
