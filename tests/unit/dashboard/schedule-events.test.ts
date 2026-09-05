import { describe, it, expect } from "vitest";
import { buildClassScheduleEvents } from "@/lib/dashboard/schedule-events";

const wed1730 = {
  enrollmentId: "e1",
  childId: "c1",
  childName: "Alex",
  templateName: "U8 Wednesdays",
  weekday: 3,
  startTime: "17:30",
  durationMinutes: 55,
  timezone: "America/New_York",
  venueName: "Powell",
  venueAddress: null,
};

describe("buildClassScheduleEvents", () => {
  it("emits booked sessions as firm events with bookingId", () => {
    const events = buildClassScheduleEvents({
      bookedSessions: [
        {
          bookingId: "b1",
          sessionId: "s1",
          startsAt: new Date("2026-09-09T21:30:00.000Z"),
          durationMinutes: 55,
          templateName: "U8 Wednesdays",
          childId: "c1",
          childName: "Alex",
          venueName: "Powell",
          venueAddress: null,
        },
      ],
      enrollments: [],
      from: new Date("2026-09-04T12:00:00Z"),
      horizonDays: 28,
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "b1",
      type: "class",
      title: "U8 Wednesdays",
      startsAt: "2026-09-09T21:30:00.000Z",
      endsAt: "2026-09-09T22:25:00.000Z",
      childId: "c1",
      childName: "Alex",
      location: "Powell",
      address: null,
      projected: false,
      bookingId: "b1",
    });
  });

  it("projects weekly occurrences to the horizon in org-local wall time", () => {
    const events = buildClassScheduleEvents({
      bookedSessions: [],
      enrollments: [wed1730],
      from: new Date("2026-09-04T12:00:00Z"),
      horizonDays: 28,
    });
    expect(events).toHaveLength(4);
    expect(events.every((e) => e.projected && e.bookingId === null)).toBe(true);
    // 17:30 America/New_York in September = 21:30Z
    expect(events[0].startsAt).toBe("2026-09-09T21:30:00.000Z");
    expect(events[0].id).toBe("proj-e1-2026-09-09");
  });

  it("suppresses a projection when a booked session for the same child+template lands within 24h", () => {
    const events = buildClassScheduleEvents({
      bookedSessions: [
        {
          bookingId: "b1",
          sessionId: "s1",
          // Same instant as the first weekly projection (Sep 9 21:30Z).
          startsAt: new Date("2026-09-09T21:30:00.000Z"),
          durationMinutes: 55,
          templateName: "U8 Wednesdays",
          childId: "c1",
          childName: "Alex",
          venueName: "Powell",
          venueAddress: null,
        },
      ],
      enrollments: [wed1730],
      from: new Date("2026-09-04T12:00:00Z"),
      horizonDays: 28,
    });

    // 1 booked + 3 remaining projections (Sep 9's projection is suppressed).
    expect(events).toHaveLength(4);
    const sep9Events = events.filter((e) => e.startsAt.startsWith("2026-09-09"));
    expect(sep9Events).toHaveLength(1);
    expect(sep9Events[0].projected).toBe(false);
    expect(sep9Events[0].bookingId).toBe("b1");
  });

  it("sorts merged output by startsAt", () => {
    const childB = {
      enrollmentId: "e2",
      childId: "c2",
      childName: "Jamie",
      templateName: "U10 Mondays",
      weekday: 1,
      startTime: "16:00",
      durationMinutes: 60,
      timezone: "America/New_York",
      venueName: "Downtown",
      venueAddress: null,
    };

    const events = buildClassScheduleEvents({
      bookedSessions: [
        {
          bookingId: "b1",
          sessionId: "s1",
          startsAt: new Date("2026-09-10T10:00:00.000Z"),
          durationMinutes: 55,
          templateName: "Make-up",
          childId: "c1",
          childName: "Alex",
          venueName: "Powell",
          venueAddress: null,
        },
      ],
      enrollments: [wed1730, childB],
      from: new Date("2026-09-04T12:00:00Z"),
      horizonDays: 14,
    });

    const sortedStartsAt = [...events.map((e) => e.startsAt)].sort();
    expect(events.map((e) => e.startsAt)).toEqual(sortedStartsAt);
    expect(events.length).toBeGreaterThan(1);
  });

  it("crosses a DST boundary keeping wall-clock time", () => {
    const events = buildClassScheduleEvents({
      bookedSessions: [],
      enrollments: [wed1730],
      from: new Date("2026-10-25T12:00:00Z"),
      horizonDays: 14,
    });

    // Nov 1 2026 is the US fall-back DST boundary — Oct 28 is still EDT
    // (UTC-4), Nov 4 is EST (UTC-5). Both keep 17:30 wall-clock local time.
    expect(events).toHaveLength(2);
    expect(events[0].startsAt).toBe("2026-10-28T21:30:00.000Z");
    expect(events[1].startsAt).toBe("2026-11-04T22:30:00.000Z");
  });
});
