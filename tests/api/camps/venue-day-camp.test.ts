/**
 * Task 5 of the 2026-09-06-camps-phase4 plan: camp day-sessions on the venue
 * command center + check-in.
 *
 * `src/lib/admin/venue-day-data.ts` mapped every non-class drop-in session to
 * type "drop_in", so a materialized camp day-session (kind='camp' — see
 * src/lib/camps/materialize.ts) rendered on the venue board as an ordinary
 * drop-in block instead of the wired-but-starved "camp" ActivityType. This
 * suite inserts a kind='camp' session directly (no cron/materializer
 * involved — that's Task 2's suite) plus a booking for a child, and asserts
 * the whole read path: venue/today → check-in/event roster → check-in POST.
 *
 * Along the way this also exercises (and pins) a fix to
 * src/pages/api/admin/check-in/event.ts: the drop_in_session roster branch
 * previously hardcoded `familyMemberId: null` / `isMinor: false` on every
 * row, showing the PARENT's name for a minor participant (the booking's
 * `userId`) instead of the CHILD's — exactly the shape every camp booking
 * has (`userId` = registering parent, `familyMemberId` = camper). See
 * resolve-signer.ts's identical left-join for the pattern this now mirrors.
 *
 * Fixtures anchor to `new Date()` (today, whatever "today" is when the suite
 * runs) per the plan's global constraint — never a fixed calendar date.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions, dropInBookings } from "@/lib/db/schema/drop-in";
import { organizations, locations } from "@/lib/db/schema/organizations";
import { venues } from "@/lib/db/schema/teams";
import { familyMembers } from "@/lib/db/schema/registrations";
import { users } from "@/lib/db/schema/users";
import { apiFetch, getAdminCookie } from "../setup/test-helpers";
import { resolveDefaultOrgForHttpTests } from "../../utils/dropin-helpers";
import { assertTestDatabase } from "../../utils/assert-test-database";

const suffix = Math.random().toString(36).slice(2, 10);

let organizationId: string;
let venueId: string;
let locationId: string;
let parentUserId: string;
let camperId: string;
let sessionId: string;
let bookingId: string;
const dateStr = new Date().toISOString().slice(0, 10); // today, YYYY-MM-DD

beforeAll(async () => {
  assertTestDatabase();
  const db = getDb();

  // Resolve the org that HTTP requests to localhost actually hit (domain
  // resolver default) — the admin session's Astro.locals.organization must
  // match this location's org, or /admin/venue/today 400s "Organization
  // context missing"/scoping mismatches.
  const orgCtx = await resolveDefaultOrgForHttpTests();
  organizationId = orgCtx.organizationId;

  // A dedicated location+venue (not the shared one resolveDefaultOrgForHttpTests
  // may return) keeps this suite's venue/today response free of ambient
  // sessions from other suites sharing the same venue/day.
  const [location] = await db
    .insert(locations)
    .values({
      name: `Camp Venue-Day Loc ${suffix}`,
      slug: `camp-venue-day-loc-${suffix}`,
      organizationId,
    })
    .returning();
  locationId = location.id;

  const [venue] = await db
    .insert(venues)
    .values({ name: `Camp Venue-Day Venue ${suffix}`, locationId })
    .returning();
  venueId = venue.id;

  const [parent] = await db
    .insert(users)
    .values({
      email: `camp-venue-day-parent-${suffix}@test.example`,
      passwordHash: "x",
      firstName: "Venue",
      lastName: "Parent",
    })
    .returning();
  parentUserId = parent.id;

  const [camper] = await db
    .insert(familyMembers)
    .values({
      parentUserId,
      firstName: "Campy",
      lastName: `VenueDay${suffix}`,
      birthDate: "2017-05-01",
    })
    .returning();
  camperId = camper.id;

  const now = new Date();
  const startsAt = new Date(now);
  startsAt.setUTCHours(9, 0, 0, 0);
  const endsAt = new Date(now);
  endsAt.setUTCHours(15, 0, 0, 0);

  const [session] = await db
    .insert(dropInSessions)
    .values({
      organizationId,
      venueId,
      kind: "camp",
      sportOrClassLabel: `Summer Camp ${suffix}`,
      formatLabel: `Camp Week ${suffix}`,
      startsAt,
      endsAt,
      capacity: 20,
      audience: "youth",
      status: "scheduled",
    })
    .returning();
  sessionId = session.id;

  const [booking] = await db
    .insert(dropInBookings)
    .values({
      sessionId,
      userId: parentUserId,
      familyMemberId: camperId,
      status: "confirmed",
      source: "auto_enrollment",
      paymentMethod: "registration",
      amountPaidCents: 0,
      brand: "aspire",
      waiverSigned: false,
    })
    .returning();
  bookingId = booking.id;
});

afterAll(async () => {
  const db = getDb();
  if (sessionId) {
    await db.delete(dropInBookings).where(eq(dropInBookings.sessionId, sessionId));
    await db.delete(dropInSessions).where(eq(dropInSessions.id, sessionId));
  }
  if (camperId) await db.delete(familyMembers).where(eq(familyMembers.id, camperId));
  if (parentUserId) await db.delete(users).where(eq(users.id, parentUserId));
  if (venueId) await db.delete(venues).where(eq(venues.id, venueId));
  if (locationId) await db.delete(locations).where(eq(locations.id, locationId));
});

describe("Camp day-sessions on the venue board + check-in (Phase 4 Task 5)", () => {
  it("GET /api/admin/venue/today surfaces the camp session with kind:'camp' and correct counts", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/venue/today?date=${dateStr}&locationId=${locationId}`,
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();

    const session = body.sessions.find((s: { id: string }) => s.id === sessionId);
    expect(session).toBeDefined();
    expect(session.kind).toBe("camp");
    expect(session.title).toContain(`Summer Camp ${suffix}`);
    expect(session.capacity).toBe(20);
    expect(session.booked).toBe(1); // one confirmed booking
  });

  it("GET /api/admin/check-in/event?kind=drop_in_session returns the camper roster with familyMemberId", async () => {
    const cookie = await getAdminCookie();
    const res = await apiFetch(
      `/api/admin/check-in/event?kind=drop_in_session&id=${sessionId}`,
      { cookie },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.event.kind).toBe("drop_in_session");
    expect(body.rows).toHaveLength(1);

    const row = body.rows[0];
    expect(row.rowKind).toBe("drop_in_booking");
    expect(row.targetId).toBe(bookingId);
    // The roster must name the CAMPER, not the registering parent — the
    // pre-fix bug this suite pins (see file header).
    expect(row.familyMemberId).toBe(camperId);
    expect(row.isMinor).toBe(true);
    expect(row.name).toContain("Campy");
    expect(row.name).toContain(`VenueDay${suffix}`);
    expect(row.checkedInAt).toBeNull();
  });

  it("POST /api/admin/check-in/check-in stamps checkedInAt and is idempotent on repeat", async () => {
    const cookie = await getAdminCookie();

    const res1 = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "drop_in_booking", targetId: bookingId }),
    });
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.booking.id).toBe(bookingId);
    expect(body1.booking.checkedInAt).not.toBeNull();
    const firstStamp = body1.booking.checkedInAt;

    // Repeat — must not error and must not move the stamp.
    const res2 = await apiFetch("/api/admin/check-in/check-in", {
      method: "POST",
      cookie,
      body: JSON.stringify({ kind: "drop_in_booking", targetId: bookingId }),
    });
    expect(res2.status).toBe(200);
    const body2 = await res2.json();
    expect(body2.booking.checkedInAt).toBe(firstStamp);

    // The roster reflects the stamp too.
    const eventRes = await apiFetch(
      `/api/admin/check-in/event?kind=drop_in_session&id=${sessionId}`,
      { cookie },
    );
    const eventBody = await eventRes.json();
    expect(eventBody.rows[0].checkedInAt).not.toBeNull();
  });
});

describe("getVenueDayEvents (lib/check-in/day-view.ts) — no kind filter, camp flows automatically", () => {
  it("includes the kind='camp' session as a drop_in_session DayEvent", async () => {
    const { getVenueDayEvents } = await import("@/lib/check-in/day-view");
    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);
    const result = await getVenueDayEvents(venueId, dayStart, dayEnd);
    expect(result).not.toBeNull();
    const event = result!.events.find((e) => e.id === sessionId);
    expect(event).toBeDefined();
    expect(event!.kind).toBe("drop_in_session");
    expect(event!.counts.expected).toBe(1);
  });
});
