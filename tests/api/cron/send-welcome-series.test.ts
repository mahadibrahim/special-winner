import { describe, it, expect, beforeAll } from "vitest";
import { eq, and } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  users,
  emailLogs,
  registrations,
  familyMembers,
  seasons,
  programs,
  sports,
  locations,
  organizations,
} from "@/lib/db/schema";

const ENDPOINT = "/api/cron/send-welcome-series";
const BASE = process.env.TEST_BASE_URL ?? "http://localhost:4321";
const CRON_SECRET = process.env.CRON_SECRET ?? "devsecret";

function runCron() {
  return fetch(`${BASE}${ENDPOINT}`, {
    method: "POST",
    headers: { "x-cron-secret": CRON_SECRET },
  });
}

/**
 * Seed a user who has one confirmed registration. Returns { userId }.
 * Mirrors the row graph in tests/api/webhooks/registration-payment.test.ts.
 */
async function seedConfirmedRegistrationUser(): Promise<{ userId: string }> {
  const db = getDb();
  const suffix = Math.random().toString(36).slice(2, 10);

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Org ${suffix}`,
      slug: `org-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();

  const [user] = await db
    .insert(users)
    .values({
      email: `ws-test-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Seed",
      lastName: "User",
    })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({
      name: `Sport ${suffix}`,
      slug: `sport-${suffix}`,
      organizationId: org.id,
    })
    .returning();

  const [location] = await db
    .insert(locations)
    .values({
      name: `Loc ${suffix}`,
      slug: `loc-${suffix}`,
      organizationId: org.id,
    })
    .returning();

  const [program] = await db
    .insert(programs)
    .values({
      name: `Prog ${suffix}`,
      slug: `prog-${suffix}`,
      sportId: sport.id,
      locationId: location.id,
      programType: "league",
    })
    .returning();

  const [season] = await db
    .insert(seasons)
    .values({
      name: `Season ${suffix}`,
      slug: `season-${suffix}`,
      programId: program.id,
      startDate: "2026-09-01",
      endDate: "2026-12-01",
      priceCents: 10000,
      status: "open",
    })
    .returning();

  const [member] = await db
    .insert(familyMembers)
    .values({
      parentUserId: user.id,
      firstName: "Kid",
      lastName: "Player",
      birthDate: "2015-01-01",
    })
    .returning();

  await db
    .insert(registrations)
    .values({
      seasonId: season.id,
      familyMemberId: member.id,
      registeredByUserId: user.id,
      status: "confirmed",
      paymentStatus: "paid",
      amountPaidCents: 10000,
      amountDueCents: 0,
      registrationType: "full",
      waiverSigned: true,
      waiverSignedAt: new Date(),
      waiverSignedBy: "Seed User",
    });

  return { userId: user.id };
}

describe("send-welcome-series cron", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await fetch(`${BASE}${ENDPOINT}`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("enrolls a user who has a confirmed registration", async () => {
    const { userId } = await seedConfirmedRegistrationUser();
    await runCron();
    const [u] = await getDb().select().from(users).where(eq(users.id, userId));
    expect(u.welcomeSeriesEnrolledAt).not.toBeNull();
  });

  it("sends step 1 once enrollment is >= 2 days old, and is idempotent", async () => {
    const { userId } = await seedConfirmedRegistrationUser();
    // Backdate enrollment to 3 days ago.
    await getDb()
      .update(users)
      .set({ welcomeSeriesEnrolledAt: new Date(Date.now() - 3 * 86_400_000) })
      .where(eq(users.id, userId));

    await runCron();
    const logs1 = await getDb()
      .select()
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), eq(emailLogs.emailType, "welcome_series_1")));
    expect(logs1.length).toBe(1);

    await runCron(); // second run must not double-send
    const logs2 = await getDb()
      .select()
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), eq(emailLogs.emailType, "welcome_series_1")));
    expect(logs2.length).toBe(1);
  });

  it("skips an opted-out user", async () => {
    const { userId } = await seedConfirmedRegistrationUser();
    await getDb()
      .update(users)
      .set({
        welcomeSeriesEnrolledAt: new Date(Date.now() - 3 * 86_400_000),
        marketingOptedOutAt: new Date(),
      })
      .where(eq(users.id, userId));

    await runCron();
    const logs = await getDb()
      .select()
      .from(emailLogs)
      .where(and(eq(emailLogs.userId, userId), eq(emailLogs.emailType, "welcome_series_1")));
    expect(logs.length).toBe(0);
  });
});
