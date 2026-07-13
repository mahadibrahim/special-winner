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

  return { org, user, session, booking, venue };
}

describe("POST /api/cron/dispatch-feedback-requests", () => {
  it("rejects a missing/bad cron secret", async () => {
    const res = await runCron("wrong-secret");
    expect(res.status).toBe(401);
  });

  it("creates + sends one NPS request for a completed drop-in booking, idempotently", async () => {
    const { user, booking, venue } = await seedCompletedDropIn();

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
    // Dispatch stamps the session's venue so the review funnel can resolve
    // per-venue Google review URLs at score time.
    expect(rows[0].metadata?.venueId).toBe(venue.id);

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

  it("collapses two eligible events for the same recipient+kind in one run to a single send", async () => {
    // Characterizes the batched cooldown check's in-run collision handling:
    // if a recipient has two events eligible for the SAME NPS kind inside a
    // single hourly scan (rare but possible), only the first processed may
    // send — the second must be skipped by the 90-day cooldown, exactly like
    // it would if the two events had been scanned an hour apart. This must
    // hold even though the batched cooldown map is computed once up front
    // (before either send happens), because dispatch tracks in-run sends via
    // an in-memory set alongside the pre-run map.
    const db = getDb();
    const { org, user, venue } = await seedCompletedDropIn();

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const [session2] = await db
      .insert(dropInSessions)
      .values({
        organizationId: org.id,
        venueId: venue.id,
        kind: "pickup",
        sportOrClassLabel: "Soccer 2",
        startsAt: new Date(threeHoursAgo.getTime() - 60 * 60 * 1000),
        endsAt: threeHoursAgo,
        capacity: 20,
        status: "completed",
      })
      .returning();
    await db.insert(dropInBookings).values({
      sessionId: session2.id,
      userId: user.id,
      status: "confirmed",
      source: "online_booking",
      paymentMethod: "card_online",
      brand: "aspire",
    });

    await runCron();

    const rows = await db
      .select()
      .from(feedbackRequests)
      .where(
        and(eq(feedbackRequests.kind, "nps_drop_in"), eq(feedbackRequests.recipientUserId, user.id)),
      );
    // Two bookings existed, but the recipient may only get one nps_drop_in
    // ask per 90-day cooldown — exactly one row, not two.
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("sent");
  });

  it("resend sweep only retries one pending row per recipient+kind in a single run", async () => {
    // Characterizes the resend sweep's in-sweep collision handling: two
    // pending rows for the SAME recipient+kind (e.g. two prior runs both
    // failed to send) must not both retry successfully in the same sweep —
    // once the first lands (status -> sent), the second must see itself as
    // now-in-cooldown, exactly as the old per-row fresh-DB re-check did.
    //
    // Deliberately does NOT use seedCompletedDropIn: a real scannable
    // booking would give the main dispatch loop its own fresh nps_drop_in
    // send for this user before resendPending runs, confounding the
    // in-sweep-collision signal this test isolates. Org + user only.
    const db = getDb();
    const suffix = Math.random().toString(36).slice(2, 10);
    const [org] = await db
      .insert(organizations)
      .values({
        name: `Resend Collision Org ${suffix}`,
        slug: `resend-collision-${suffix}`,
        organizationType: "headquarters",
        features: { enableNpsSurveys: true },
      })
      .returning();
    const [user] = await db
      .insert(users)
      .values({
        email: `resend-collision-${suffix}@test.example`,
        passwordHash: "x",
        firstName: "Resend",
        lastName: "Collision",
      })
      .returning();

    const future = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const [row1] = await db
      .insert(feedbackRequests)
      .values({
        organizationId: org.id,
        brand: "aspire",
        kind: "nps_drop_in",
        targetId: crypto.randomUUID(),
        recipientUserId: user.id,
        tokenHash: `resend-collision-a-${Math.random().toString(36).slice(2)}`,
        status: "pending",
        expiresAt: future,
        metadata: { eventLabel: "Pending event A" },
      })
      .returning();
    // Insert row2 slightly after row1 so resendPending's createdAt ASC order
    // is deterministic (row1 processed first).
    await new Promise((r) => setTimeout(r, 10));
    const [row2] = await db
      .insert(feedbackRequests)
      .values({
        organizationId: org.id,
        brand: "aspire",
        kind: "nps_drop_in",
        targetId: crypto.randomUUID(),
        recipientUserId: user.id,
        tokenHash: `resend-collision-b-${Math.random().toString(36).slice(2)}`,
        status: "pending",
        expiresAt: future,
        metadata: { eventLabel: "Pending event B" },
      })
      .returning();

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
    const byId = new Map(rows.map((r) => [r.id, r]));
    const statuses = [byId.get(row1.id)?.status, byId.get(row2.id)?.status];
    // Exactly one of the two retried (sent); the other stays pending because
    // the sweep's in-memory collision guard caught it, same as the old
    // sequential fresh-DB-query behavior would have.
    expect(statuses.filter((s) => s === "sent").length).toBe(1);
    expect(statuses.filter((s) => s === "pending").length).toBe(1);
    // The one that sent must be the earlier-created row (createdAt ASC is
    // the sweep's processing order).
    expect(byId.get(row1.id)?.status).toBe("sent");
    expect(byId.get(row2.id)?.status).toBe("pending");
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
