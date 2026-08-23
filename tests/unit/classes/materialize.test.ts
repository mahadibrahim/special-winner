import { describe, it, expect, vi, beforeEach } from "vitest";
import { occurrenceInstants, HORIZON_DAYS } from "@/lib/classes/materialize";

describe("occurrenceInstants — pure tz-aware occurrence math", () => {
  it("resolves a plain UTC-timezone weekday/time inside the window", () => {
    // Monday 2026-08-24T00:00:00Z; weekday=2 (Tue) only lands once in an
    // 8-day window when `now` itself is a Monday (next Tuesday is outside).
    const now = new Date("2026-08-24T00:00:00Z");
    const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
    const out = occurrenceInstants(2, "10:00:00", "UTC", now, horizonEnd);
    expect(out.map((d) => d.toISOString())).toEqual(["2026-08-25T10:00:00.000Z"]);
  });

  it("excludes an instant exactly AT `now` (strictly future only)", () => {
    const now = new Date("2026-08-25T10:00:00.000Z"); // itself the Tuesday occurrence
    const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
    const out = occurrenceInstants(2, "10:00:00", "UTC", now, horizonEnd);
    // The next Tuesday (Sep 1) is exactly at horizonEnd — included ("<=").
    expect(out.map((d) => d.toISOString())).toEqual(["2026-09-01T10:00:00.000Z"]);
  });

  it("includes an instant exactly AT horizonEnd, excludes one 1ms past it", () => {
    const now = new Date("2026-08-24T00:00:00Z"); // Monday
    const target = new Date("2026-08-25T10:00:00.000Z"); // the only Tuesday in a ~1-day window
    // horizonEnd == the occurrence's own instant: boundary inclusive ("<=").
    const atBoundary = occurrenceInstants(2, "10:00:00", "UTC", now, target);
    expect(atBoundary.map((d) => d.toISOString())).toEqual([target.toISOString()]);
    // horizonEnd 1ms before the occurrence: excluded.
    const justBefore = new Date(target.getTime() - 1);
    const excluded = occurrenceInstants(2, "10:00:00", "UTC", now, justBefore);
    expect(excluded).toEqual([]);
  });

  it("returns two occurrences when the 8-day window spans a full week for that weekday", () => {
    const now = new Date("2026-08-24T00:00:00Z"); // Monday
    const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86_400_000);
    // weekday=1 (Mon): today (later this same day) AND next Monday, both <= horizonEnd.
    const out = occurrenceInstants(1, "10:00:00", "UTC", now, horizonEnd);
    expect(out.map((d) => d.toISOString())).toEqual([
      "2026-08-24T10:00:00.000Z",
      "2026-08-31T10:00:00.000Z",
    ]);
  });

  it("America/New_York spring-forward (2027-03-14): offset flips EST→EDT across the boundary", () => {
    // 2027-03-14 is the 2nd Sunday of March — US DST start. March 9 and
    // March 16, 2027 are both Tuesdays (weekday=2), straddling the transition.
    // `now` anchored at 22:00 UTC (not midnight) so horizonEnd's time-of-day
    // is late enough to still cover the 17:00-local second occurrence —
    // otherwise the 8-day window's exact instant boundary would clip it,
    // same as the "includes an instant exactly AT horizonEnd" case above.
    const now = new Date("2027-03-08T22:00:00Z");
    const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86_400_000); // 2027-03-16T22:00:00Z
    const out = occurrenceInstants(2, "17:00:00", "America/New_York", now, horizonEnd);
    // Before the transition: EST = UTC-5 → 17:00 local = 22:00 UTC.
    // At/after the transition: EDT = UTC-4 → 17:00 local = 21:00 UTC.
    expect(out.map((d) => d.toISOString())).toEqual([
      "2027-03-09T22:00:00.000Z",
      "2027-03-16T21:00:00.000Z",
    ]);
  });

  it("America/New_York fall-back (2027-11-07): offset flips EDT→EST across the boundary", () => {
    // 2027-11-07 is the 1st Sunday of November — US DST end. Nov 1 and
    // Nov 8, 2027 are both Mondays (weekday=1), straddling the transition.
    const now = new Date("2027-11-01T00:00:00Z");
    const horizonEnd = new Date(now.getTime() + HORIZON_DAYS * 86_400_000); // 2027-11-09T00:00:00Z
    const out = occurrenceInstants(1, "08:00:00", "America/New_York", now, horizonEnd);
    // Before the transition: EDT = UTC-4 → 08:00 local = 12:00 UTC.
    // At/after the transition: EST = UTC-5 → 08:00 local = 13:00 UTC.
    expect(out.map((d) => d.toISOString())).toEqual([
      "2027-11-01T12:00:00.000Z",
      "2027-11-08T13:00:00.000Z",
    ]);
  });
});

// ---- materializeClassSessions (batch loop) ----
//
// getDb() is mocked so the batch logic — idempotent session inserts,
// per-session transactions, per-enrollment auto-booking isolation, and the
// counter breakdown — is testable without a live DB. createChildClassBooking
// is mocked too (its own behavior is covered by book-child's own tests);
// this suite only asserts materialize.ts wires it correctly and buckets its
// results. Same vi.mock("@/lib/db", ...) shape as
// tests/unit/memberships/annual-fee.test.ts.
import { classSlotTemplates } from "@/lib/db/schema/classes";

interface TemplateRow {
  template: Record<string, unknown>;
  orgTimezone: string | null;
}
interface EnrollmentRow {
  familyMemberId: string;
  parentUserId: string | null;
}

let templateRows: TemplateRow[] = [];
let enrollmentRows: EnrollmentRow[] = [];
/** starts_at ISO strings for which the insert should look already-materialized (onConflictDoNothing conflict → no row returned). */
let alreadyExistsIso: Set<string> = new Set();
/** starts_at ISO strings for which the insert itself should throw (simulated tx failure). */
let insertThrowsIso: Set<string> = new Set();
let insertedCount = 0;
const insertedSessionValues: Array<Record<string, unknown>> = [];

vi.mock("@/lib/db", () => ({
  getDb: () => ({
    select: () => ({
      from: (table: unknown) => {
        if (table === classSlotTemplates) {
          return { innerJoin: () => ({ where: async () => templateRows }) };
        }
        throw new Error("unexpected top-level select target in test double");
      },
    }),
    transaction: async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        insert: () => ({
          values: (vals: Record<string, unknown>) => ({
            onConflictDoNothing: () => ({
              returning: async () => {
                const iso = (vals.startsAt as Date).toISOString();
                insertedSessionValues.push(vals);
                if (insertThrowsIso.has(iso)) throw new Error("insert boom");
                if (alreadyExistsIso.has(iso)) return [];
                insertedCount += 1;
                return [{ id: `session-${insertedCount}` }];
              },
            }),
          }),
        }),
        select: () => ({
          from: () => ({ innerJoin: () => ({ where: async () => enrollmentRows }) }),
        }),
      };
      return cb(tx);
    },
  }),
}));

const createChildClassBooking = vi.fn();
vi.mock("@/lib/classes/book-child", () => ({
  createChildClassBooking: (...args: unknown[]) => createChildClassBooking(...args),
}));

import { materializeClassSessions } from "@/lib/classes/materialize";

/** A single-occurrence template: weekday=Tue relative to a Monday `now`, UTC tz — deterministic, no DST. */
function tuesdayTemplate(overrides: Partial<Record<string, unknown>> = {}): TemplateRow {
  return {
    template: {
      id: "tmpl-1",
      organizationId: "org-1",
      venueId: "venue-1",
      name: "Soccer Skills 6-8",
      sportLabel: "Soccer",
      weekday: 2,
      startTime: "10:00:00",
      durationMins: 55,
      capacity: 12,
      active: true,
      ...overrides,
    },
    orgTimezone: "UTC",
  };
}

const NOW = new Date("2026-08-24T00:00:00Z"); // Monday
const EXPECTED_STARTS_AT_ISO = "2026-08-25T10:00:00.000Z"; // the one Tuesday occurrence in [now, now+8d]

describe("materializeClassSessions", () => {
  beforeEach(() => {
    templateRows = [];
    enrollmentRows = [];
    alreadyExistsIso = new Set();
    insertThrowsIso = new Set();
    insertedCount = 0;
    insertedSessionValues.length = 0;
    createChildClassBooking.mockReset();
  });

  it("creates a session and auto-books an active enrollment (ok result)", async () => {
    templateRows = [tuesdayTemplate()];
    enrollmentRows = [{ familyMemberId: "child-1", parentUserId: "parent-1" }];
    createChildClassBooking.mockResolvedValue({
      ok: true,
      bookingId: "booking-1",
      paymentMethod: "member_allotment",
    });

    const result = await materializeClassSessions(NOW);

    expect(result).toEqual({
      sessionsCreated: 1,
      autoBooked: 1,
      skippedExhausted: 0,
      skippedPastDue: 0,
      failed: 0,
    });
    expect(createChildClassBooking).toHaveBeenCalledExactlyOnceWith({
      sessionId: "session-1",
      parentUserId: "parent-1",
      familyMemberId: "child-1",
      kind: "member",
      source: "auto_enrollment",
      dbOrTx: expect.anything(),
    });
    // The inserted session mirrors the template's fields (venue/org/kind/audience).
    expect(insertedSessionValues[0]).toMatchObject({
      organizationId: "org-1",
      venueId: "venue-1",
      kind: "class",
      audience: "youth",
      status: "scheduled",
      classSlotTemplateId: "tmpl-1",
      sportOrClassLabel: "Soccer",
      formatLabel: "Soccer Skills 6-8",
      capacity: 12,
      startsAt: new Date(EXPECTED_STARTS_AT_ISO),
    });
  });

  it("counts allotment_exhausted as skippedExhausted", async () => {
    templateRows = [tuesdayTemplate()];
    enrollmentRows = [{ familyMemberId: "child-1", parentUserId: "parent-1" }];
    createChildClassBooking.mockResolvedValue({
      ok: false,
      error: { code: "allotment_exhausted", message: "used up" },
    });

    const result = await materializeClassSessions(NOW);

    expect(result).toEqual({
      sessionsCreated: 1,
      autoBooked: 0,
      skippedExhausted: 1,
      skippedPastDue: 0,
      failed: 0,
    });
  });

  it("counts no_membership as skippedPastDue", async () => {
    templateRows = [tuesdayTemplate()];
    enrollmentRows = [{ familyMemberId: "child-1", parentUserId: "parent-1" }];
    createChildClassBooking.mockResolvedValue({
      ok: false,
      error: { code: "no_membership", message: "lapsed" },
    });

    const result = await materializeClassSessions(NOW);

    expect(result).toEqual({
      sessionsCreated: 1,
      autoBooked: 0,
      skippedExhausted: 0,
      skippedPastDue: 1,
      failed: 0,
    });
  });

  it("counts any other error code as failed, and isolates a thrown booking error", async () => {
    templateRows = [tuesdayTemplate()];
    enrollmentRows = [
      { familyMemberId: "child-1", parentUserId: "parent-1" },
      { familyMemberId: "child-2", parentUserId: "parent-2" },
    ];
    createChildClassBooking
      .mockResolvedValueOnce({ ok: false, error: { code: "session_full", message: "full" } })
      .mockRejectedValueOnce(new Error("db blip"));

    const result = await materializeClassSessions(NOW);

    // The session itself still committed (2 failed bookings don't roll it back).
    expect(result).toEqual({
      sessionsCreated: 1,
      autoBooked: 0,
      skippedExhausted: 0,
      skippedPastDue: 0,
      failed: 2,
    });
  });

  it("never re-books an already-materialized session (onConflictDoNothing conflict)", async () => {
    templateRows = [tuesdayTemplate()];
    enrollmentRows = [{ familyMemberId: "child-1", parentUserId: "parent-1" }];
    alreadyExistsIso = new Set([EXPECTED_STARTS_AT_ISO]);

    const result = await materializeClassSessions(NOW);

    expect(result).toEqual({
      sessionsCreated: 0,
      autoBooked: 0,
      skippedExhausted: 0,
      skippedPastDue: 0,
      failed: 0,
    });
    expect(createChildClassBooking).not.toHaveBeenCalled();
  });

  it("isolates a per-session transaction failure: other occurrences/templates still process", async () => {
    // Two templates with distinct start times (distinct starts_at) so the
    // insert-throws gate can target just the first template's occurrence.
    templateRows = [
      tuesdayTemplate({ id: "tmpl-fail", venueId: "venue-fail", startTime: "09:00:00" }),
      tuesdayTemplate({ id: "tmpl-ok", venueId: "venue-ok", startTime: "10:00:00" }),
    ];
    enrollmentRows = [{ familyMemberId: "child-1", parentUserId: "parent-1" }];
    createChildClassBooking.mockResolvedValue({
      ok: true,
      bookingId: "booking-1",
      paymentMethod: "member_allotment",
    });
    insertThrowsIso = new Set(["2026-08-25T09:00:00.000Z"]);

    const result = await materializeClassSessions(NOW);

    expect(result).toEqual({
      sessionsCreated: 1,
      autoBooked: 1,
      skippedExhausted: 0,
      skippedPastDue: 0,
      failed: 1,
    });
  });

  it("skips inactive templates entirely (query-level filter, nothing to assert on result shape beyond zero)", async () => {
    templateRows = []; // the `active = true` filter is expressed in the real query's .where(); the mock just returns none here
    const result = await materializeClassSessions(NOW);
    expect(result).toEqual({
      sessionsCreated: 0,
      autoBooked: 0,
      skippedExhausted: 0,
      skippedPastDue: 0,
      failed: 0,
    });
    expect(createChildClassBooking).not.toHaveBeenCalled();
  });
});
