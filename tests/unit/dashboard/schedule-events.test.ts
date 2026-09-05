import { describe, it, expect } from "vitest";
import { buildClassScheduleEvents, buildLeagueGameEvents } from "@/lib/dashboard/schedule-events";

const wed1730 = {
  enrollmentId: "e1",
  childId: "c1",
  childName: "Alex",
  templateName: "U8 Wednesdays",
  // No templateId on the base fixture — exercises the name-fallback path by
  // default; tests that need id-based matching override it per-case.
  templateId: null,
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
          templateId: null,
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
          templateId: null,
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

  it("suppresses a projection by templateId even when the template was renamed", () => {
    const events = buildClassScheduleEvents({
      bookedSessions: [
        {
          bookingId: "b1",
          sessionId: "s1",
          // Same instant as the first weekly projection (Sep 9 21:30Z).
          startsAt: new Date("2026-09-09T21:30:00.000Z"),
          durationMinutes: 55,
          // Renamed since materialization — name no longer matches the
          // enrollment's templateName, but templateId still does.
          templateName: "U8 Wednesdays (Renamed)",
          templateId: "t1",
          childId: "c1",
          childName: "Alex",
          venueName: "Powell",
          venueAddress: null,
        },
      ],
      enrollments: [{ ...wed1730, templateId: "t1" }],
      from: new Date("2026-09-04T12:00:00Z"),
      horizonDays: 28,
    });

    // 1 booked + 3 remaining projections (Sep 9's projection is suppressed
    // despite the name mismatch, because templateId matched).
    expect(events).toHaveLength(4);
    const sep9Events = events.filter((e) => e.startsAt.startsWith("2026-09-09"));
    expect(sep9Events).toHaveLength(1);
    expect(sep9Events[0].projected).toBe(false);
    expect(sep9Events[0].bookingId).toBe("b1");
  });

  it("falls back to name matching when templateId is null (legacy rows)", () => {
    const events = buildClassScheduleEvents({
      bookedSessions: [
        {
          bookingId: "b1",
          sessionId: "s1",
          startsAt: new Date("2026-09-09T21:30:00.000Z"),
          durationMinutes: 55,
          templateName: "U8 Wednesdays",
          templateId: null,
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

    expect(events).toHaveLength(4);
    const sep9Events = events.filter((e) => e.startsAt.startsWith("2026-09-09"));
    expect(sep9Events).toHaveLength(1);
    expect(sep9Events[0].projected).toBe(false);
    expect(sep9Events[0].bookingId).toBe("b1");
  });

  it("suppresses a projection when the booked row has a null templateId but the enrollment has one (one-off admin-created session, mirrors the endpoint's real asymmetric shape)", () => {
    const events = buildClassScheduleEvents({
      bookedSessions: [
        {
          bookingId: "b1",
          sessionId: "s1",
          // Same instant as the first weekly projection (Sep 9 21:30Z).
          startsAt: new Date("2026-09-09T21:30:00.000Z"),
          durationMinutes: 55,
          // classSlotTemplateId is null — e.g. a template that was since
          // deleted (ON DELETE SET NULL) or a one-off admin-created class
          // session never linked to a template. The endpoint's enrollment
          // leg, by contrast, always has a templateId (inner join), so a
          // purely id-keyed lookup would never find this booked row.
          templateName: "U8 Wednesdays",
          templateId: null,
          childId: "c1",
          childName: "Alex",
          venueName: "Powell",
          venueAddress: null,
        },
      ],
      enrollments: [{ ...wed1730, templateId: "t1" }],
      from: new Date("2026-09-04T12:00:00Z"),
      horizonDays: 28,
    });

    // 1 booked + 3 remaining projections (Sep 9's projection is suppressed
    // via the name-key fallback, despite the enrollment side being
    // id-keyed).
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
      templateId: null,
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
          templateId: null,
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

describe("buildLeagueGameEvents", () => {
  const baseGame = {
    gameId: "g1",
    scheduledAt: new Date("2026-09-13T14:00:00.000Z"),
    durationMinutes: 60,
    status: "scheduled" as const,
    fieldNumber: "3",
    childId: "c1",
    childName: "Alex",
    teamName: "Powell U10",
    opponentName: "Dublin U10",
    venueName: "Powell Sports Complex",
    venueAddress: "123 Main St",
  };

  it("maps a full game to a schedule event", () => {
    const events = buildLeagueGameEvents({ games: [baseGame] });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      id: "game-g1-c1",
      type: "game",
      title: "Powell U10 vs Dublin U10",
      startsAt: "2026-09-13T14:00:00.000Z",
      endsAt: "2026-09-13T15:00:00.000Z",
      childId: "c1",
      childName: "Alex",
      location: "Powell Sports Complex · Field 3",
      address: "123 Main St",
      projected: false,
      bookingId: null,
      status: "scheduled",
    });
  });

  it("titles a TBD fixture when opponentName is null", () => {
    const events = buildLeagueGameEvents({
      games: [{ ...baseGame, opponentName: null }],
    });

    expect(events[0].title).toBe("Powell U10 — opponent TBD");
  });

  it("maps null durationMinutes to a null endsAt", () => {
    const events = buildLeagueGameEvents({
      games: [{ ...baseGame, durationMinutes: null }],
    });

    expect(events[0].endsAt).toBeNull();
  });

  it("omits the field suffix when fieldNumber is null", () => {
    const events = buildLeagueGameEvents({
      games: [{ ...baseGame, fieldNumber: null }],
    });

    expect(events[0].location).toBe("Powell Sports Complex");
  });

  it("passes through a non-default status", () => {
    const events = buildLeagueGameEvents({
      games: [{ ...baseGame, status: "postponed" }],
    });

    expect(events[0].status).toBe("postponed");
  });

  it("emits one event per rostered child on the same game with distinct ids", () => {
    const events = buildLeagueGameEvents({
      games: [
        baseGame,
        { ...baseGame, childId: "c2", childName: "Jamie" },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events.map((e) => e.id).sort()).toEqual(["game-g1-c1", "game-g1-c2"]);
  });

  it("sorts output by startsAt", () => {
    const later = {
      ...baseGame,
      gameId: "g2",
      scheduledAt: new Date("2026-09-20T14:00:00.000Z"),
    };
    const earlier = {
      ...baseGame,
      gameId: "g0",
      scheduledAt: new Date("2026-09-06T14:00:00.000Z"),
    };

    const events = buildLeagueGameEvents({ games: [baseGame, later, earlier] });

    expect(events.map((e) => e.id)).toEqual(["game-g0-c1", "game-g1-c1", "game-g2-c1"]);
  });
});
