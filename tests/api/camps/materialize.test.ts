/**
 * POST /api/cron/materialize-class-sessions — camp half (Phase 4 Task 2).
 *
 * Seeds a fully test-owned org graph (org → sport/location → camp program →
 * seasons → venue/pods/registrations), so nothing here depends on ambient
 * staging fixtures and nothing it asserts on can be touched by other suites.
 * Fixtures anchor to `new Date()` (plan rule) — the season runs from
 * yesterday through +6 days, which always spans at least one Mon–Fri day
 * inside the cron's horizon regardless of when the suite runs.
 *
 * The cron sweeps ALL eligible camp seasons in the shared DB, so global
 * counters (`camps.sessionsCreated` etc.) are asserted for SHAPE only;
 * every behavioral assertion is scoped to this file's own season ids.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { coachingAssignments } from "@/lib/db/schema/coaching";
import { programs, seasons } from "@/lib/db/schema/programs";
import { sports } from "@/lib/db/schema/sports";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { teams, venues } from "@/lib/db/schema/teams";
import { users } from "@/lib/db/schema/users";
import { apiFetch } from "../setup/test-helpers";
import { assertTestDatabase } from "../../utils/assert-test-database";

const CRON_SECRET = process.env.CRON_SECRET;
const DAY_MS = 86_400_000;

const suffix = Math.random().toString(36).slice(2, 10);

let orgId: string;
let venueId: string;
let parentUserId: string;
let coachAId: string; // lead on pod A
let coachBId: string; // assistant on pod A, lead on pod B -> lead wins
let coachCId: string; // assistant on pod B
let campSeasonId: string;
let noVenueSeasonId: string;
let confirmedChildId: string;
let cancelledChildId: string;

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function postCron(secret: string) {
  return apiFetch("/api/cron/materialize-class-sessions", {
    method: "POST",
    headers: { "x-cron-secret": secret },
  });
}

beforeAll(async () => {
  assertTestDatabase();
  const db = getDb();
  const now = new Date();

  const [org] = await db
    .insert(organizations)
    .values({
      name: `Camp Cron Org ${suffix}`,
      slug: `camp-cron-org-${suffix}`,
      organizationType: "headquarters",
    })
    .returning();
  orgId = org.id;

  const [location] = await db
    .insert(locations)
    .values({ name: `Camp Loc ${suffix}`, slug: `camp-loc-${suffix}`, organizationId: orgId })
    .returning();

  const [sport] = await db
    .insert(sports)
    .values({ name: `Camp Sport ${suffix}`, slug: `camp-sport-${suffix}`, organizationId: orgId })
    .returning();

  const [venue] = await db
    .insert(venues)
    .values({ name: `Camp Venue ${suffix}`, locationId: location.id })
    .returning();
  venueId = venue.id;

  const [parent] = await db
    .insert(users)
    .values({
      email: `camp-cron-parent-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Cam",
      lastName: "Parent",
    })
    .returning();
  parentUserId = parent.id;

  const coachRows = await db
    .insert(users)
    .values(
      ["a", "b", "c"].map((k) => ({
        email: `camp-cron-coach-${k}-${suffix}@test.example`,
        passwordHash: "x",
        firstName: `Coach${k.toUpperCase()}`,
        lastName: "Camp",
      })),
    )
    .returning();
  // insert order is preserved in RETURNING for a single VALUES list
  [coachAId, coachBId, coachCId] = coachRows.map((r) => r.id);

  const [program] = await db
    .insert(programs)
    .values({
      name: `Summer Camp ${suffix}`,
      slug: `summer-camp-${suffix}`,
      sportId: sport.id,
      locationId: location.id,
      programType: "camp",
    })
    .returning();

  // Anchored to now: started yesterday, ends +6 days — always overlaps the
  // horizon and always contains at least one weekday.
  const startDate = isoDate(new Date(now.getTime() - DAY_MS));
  const endDate = isoDate(new Date(now.getTime() + 6 * DAY_MS));

  const [season] = await db
    .insert(seasons)
    .values({
      name: `Camp Week ${suffix}`,
      slug: `camp-week-${suffix}`,
      programId: program.id,
      venueId,
      startDate,
      endDate,
      priceCents: 25000,
      maxParticipants: 24,
      startTime: "09:30:00",
      endTime: "14:30:00",
      status: "open",
    })
    .returning();
  campSeasonId = season.id;

  // A second in-range camp season with NO venue — must be reported in
  // skippedNoVenue and must materialize nothing.
  const [noVenueSeason] = await db
    .insert(seasons)
    .values({
      name: `Camp NoVenue ${suffix}`,
      slug: `camp-novenue-${suffix}`,
      programId: program.id,
      venueId: null,
      startDate,
      endDate,
      priceCents: 25000,
      status: "open",
    })
    .returning();
  noVenueSeasonId = noVenueSeason.id;

  // Pods: coach B is assistant on pod A but lead on pod B — lead must win.
  await db.insert(teams).values([
    {
      seasonId: campSeasonId,
      name: `Pod A ${suffix}`,
      coachUserId: coachAId,
      assistantCoachUserId: coachBId,
    },
    {
      seasonId: campSeasonId,
      name: `Pod B ${suffix}`,
      coachUserId: coachBId,
      assistantCoachUserId: coachCId,
    },
  ]);

  const [confirmedChild] = await db
    .insert(familyMembers)
    .values({
      parentUserId,
      firstName: "Campy",
      lastName: `Confirmed${suffix}`,
      birthDate: "2017-04-01",
    })
    .returning();
  confirmedChildId = confirmedChild.id;

  const [cancelledChild] = await db
    .insert(familyMembers)
    .values({
      parentUserId,
      firstName: "Campy",
      lastName: `Cancelled${suffix}`,
      birthDate: "2016-04-01",
    })
    .returning();
  cancelledChildId = cancelledChild.id;

  await db.insert(registrations).values([
    {
      seasonId: campSeasonId,
      familyMemberId: confirmedChildId,
      registeredByUserId: parentUserId,
      status: "confirmed",
      paymentStatus: "paid",
      amountPaidCents: 25000,
      amountDueCents: 25000,
    },
    {
      seasonId: campSeasonId,
      familyMemberId: cancelledChildId,
      registeredByUserId: parentUserId,
      status: "cancelled",
      paymentStatus: "unpaid",
      amountPaidCents: 0,
      amountDueCents: 25000,
    },
  ]);
});

afterAll(async () => {
  const db = getDb();
  const seasonIds = [campSeasonId, noVenueSeasonId].filter(Boolean);
  if (seasonIds.length > 0) {
    const sessionRows = await db
      .select({ id: dropInSessions.id })
      .from(dropInSessions)
      .where(inArray(dropInSessions.campSeasonId, seasonIds));
    const sessionIds = sessionRows.map((s) => s.id);
    if (sessionIds.length > 0) {
      // coaching_assignments has no FK to its polymorphic target — explicit.
      await db
        .delete(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.kind, "class_session"),
            inArray(coachingAssignments.targetId, sessionIds),
          ),
        );
      await db.delete(dropInBookings).where(inArray(dropInBookings.sessionId, sessionIds));
      await db.delete(dropInSessions).where(inArray(dropInSessions.id, sessionIds));
    }
    await db.delete(registrations).where(inArray(registrations.seasonId, seasonIds));
  }
  if (orgId) {
    // Cascades: locations -> programs -> seasons -> teams; users cascade
    // familyMembers. Venue precedes nothing that restricts once sessions
    // are gone (locations cascade covers it).
    await db.delete(organizations).where(eq(organizations.id, orgId));
    await db
      .delete(users)
      .where(inArray(users.id, [parentUserId, coachAId, coachBId, coachCId].filter(Boolean)));
  }
});

describe("POST /api/cron/materialize-class-sessions — camps", () => {
  it(
    "materializes weekday camp day-sessions, staffs them with pod coaches (lead wins), " +
      "auto-books confirmed registrants via paymentMethod='registration', reports " +
      "no-venue seasons, and is idempotent on a second run",
    async (ctx) => {
      if (!CRON_SECRET) return ctx.skip();
      const db = getDb();

      // ---- Run 1 ----
      const res1 = await postCron(CRON_SECRET);
      expect(res1.status).toBe(200);
      const body1 = await res1.json();

      // Backward-compatible response shape: flat classes counters AND the
      // nested { classes, camps } blocks.
      for (const key of ["sessionsCreated", "autoBooked", "failed"]) {
        expect(typeof body1[key]).toBe("number");
        expect(typeof body1.classes[key]).toBe("number");
        expect(typeof body1.camps[key]).toBe("number");
      }
      expect(Array.isArray(body1.camps.skippedNoVenue)).toBe(true);
      expect(body1.camps.skippedNoVenue).toContain(noVenueSeasonId);

      // At least one camp day-session for our season, none for the
      // venue-less one, all weekday-scheduled with season metadata.
      const sessions1 = await db
        .select()
        .from(dropInSessions)
        .where(eq(dropInSessions.campSeasonId, campSeasonId))
        .orderBy(asc(dropInSessions.startsAt));
      expect(sessions1.length).toBeGreaterThanOrEqual(1);
      for (const s of sessions1) {
        expect(s.kind).toBe("camp");
        expect(s.status).toBe("scheduled");
        expect(s.venueId).toBe(venueId);
        expect(s.capacity).toBe(24);
        expect(s.audience).toBe("youth");
        expect(s.endsAt.getTime()).toBeGreaterThan(s.startsAt.getTime());
      }
      const noVenueSessions = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(eq(dropInSessions.campSeasonId, noVenueSeasonId));
      expect(noVenueSessions.length).toBe(0);

      const sessionIds = sessions1.map((s) => s.id);

      // Pod-coach staffing on every materialized day-session: A lead,
      // B lead (lead wins over pod A's assistant slot), C assistant.
      for (const sessionId of sessionIds) {
        const staffing = await db
          .select({
            coachUserId: coachingAssignments.coachUserId,
            role: coachingAssignments.role,
            active: coachingAssignments.active,
          })
          .from(coachingAssignments)
          .where(
            and(
              eq(coachingAssignments.kind, "class_session"),
              eq(coachingAssignments.targetId, sessionId),
            ),
          );
        expect(staffing).toHaveLength(3);
        const byId = new Map(staffing.map((a) => [a.coachUserId, a]));
        expect(byId.get(coachAId)?.role).toBe("lead");
        expect(byId.get(coachBId)?.role).toBe("lead");
        expect(byId.get(coachCId)?.role).toBe("assistant");
        for (const a of staffing) expect(a.active).toBe(true);
      }

      // The confirmed child is auto-booked into EVERY materialized
      // day-session; the cancelled registration books nothing.
      const confirmedBookings1 = await db
        .select()
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.familyMemberId, confirmedChildId),
            inArray(dropInBookings.sessionId, sessionIds),
          ),
        );
      expect(confirmedBookings1.length).toBe(sessionIds.length);
      for (const b of confirmedBookings1) {
        expect(b.status).toBe("confirmed");
        expect(b.source).toBe("auto_enrollment");
        expect(b.paymentMethod).toBe("registration");
        expect(b.amountPaidCents).toBe(0);
        expect(b.userId).toBe(parentUserId);
        expect(b.brand).toBe("aspire");
      }
      const cancelledBookings = await db
        .select({ id: dropInBookings.id })
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.familyMemberId, cancelledChildId),
            inArray(dropInBookings.sessionId, sessionIds),
          ),
        );
      expect(cancelledBookings.length).toBe(0);

      // ---- Run 2: idempotent ----
      const res2 = await postCron(CRON_SECRET);
      expect(res2.status).toBe(200);
      const body2 = await res2.json();
      expect(body2.camps.skippedNoVenue).toContain(noVenueSeasonId);

      const sessions2 = await db
        .select({ id: dropInSessions.id })
        .from(dropInSessions)
        .where(eq(dropInSessions.campSeasonId, campSeasonId));
      expect(sessions2.length).toBe(sessions1.length);

      const confirmedBookings2 = await db
        .select({ id: dropInBookings.id })
        .from(dropInBookings)
        .where(
          and(
            eq(dropInBookings.familyMemberId, confirmedChildId),
            inArray(dropInBookings.sessionId, sessionIds),
          ),
        );
      expect(confirmedBookings2.length).toBe(confirmedBookings1.length);

      // Staffing not duplicated either.
      const staffingAfter = await db
        .select({ id: coachingAssignments.id })
        .from(coachingAssignments)
        .where(
          and(
            eq(coachingAssignments.kind, "class_session"),
            inArray(coachingAssignments.targetId, sessionIds),
          ),
        );
      expect(staffingAfter.length).toBe(sessionIds.length * 3);
    },
  );

  it("rejects a wrong cron secret (401)", async (ctx) => {
    if (!CRON_SECRET) return ctx.skip();
    const res = await postCron("definitely-not-the-secret");
    expect(res.status).toBe(401);
  });
});
