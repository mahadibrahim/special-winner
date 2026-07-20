import { describe, it, expect } from "vitest";
import { deriveVenueTabs, filterPickupSessions } from "@/lib/landing/pickup-session-filters";
import type { SessionCardData } from "@/components/dropin/SessionCard";

function s(over: Partial<SessionCardData>): SessionCardData {
  return {
    id: over.id ?? "x",
    kind: "pickup",
    audience: "adult",
    sportOrClassLabel: "Coed Soccer",
    formatLabel: null,
    skillLevel: "intermediate",
    venueId: "v1",
    venueName: "Worthington",
    startsAt: "2026-07-21T23:00:00.000Z",
    endsAt: "2026-07-22T00:00:00.000Z",
    capacity: 12,
    confirmedCount: 3,
    sessionRateCents: 1500,
    ...over,
  } as SessionCardData;
}

describe("deriveVenueTabs", () => {
  it("returns distinct venues with counts, sorted by count desc then name asc", () => {
    const tabs = deriveVenueTabs([
      s({ id: "a", venueId: "v1", venueName: "Worthington" }),
      s({ id: "b", venueId: "v2", venueName: "Downtown" }),
      s({ id: "c", venueId: "v1", venueName: "Worthington" }),
    ]);
    expect(tabs).toEqual([
      { venueId: "v1", venueName: "Worthington", count: 2 },
      { venueId: "v2", venueName: "Downtown", count: 1 },
    ]);
  });

  it("skips sessions with no venue", () => {
    const tabs = deriveVenueTabs([s({ id: "a", venueId: null, venueName: null })]);
    expect(tabs).toEqual([]);
  });
});

describe("filterPickupSessions", () => {
  const data = [
    s({ id: "a", venueId: "v1", venueName: "Worthington", sportOrClassLabel: "Coed Soccer", skillLevel: "recreational" }),
    s({ id: "b", venueId: "v2", venueName: "Downtown", sportOrClassLabel: "Mens Soccer", skillLevel: "advanced" }),
  ];

  it("filters by venueId", () => {
    expect(filterPickupSessions(data, { venueId: "v2" }).map((x) => x.id)).toEqual(["b"]);
  });

  it("null/undefined venueId returns all", () => {
    expect(filterPickupSessions(data, { venueId: null })).toHaveLength(2);
  });

  it("filters by skill and exact sport", () => {
    expect(filterPickupSessions(data, { skill: "advanced" }).map((x) => x.id)).toEqual(["b"]);
    expect(filterPickupSessions(data, { sport: "Coed Soccer" }).map((x) => x.id)).toEqual(["a"]);
  });

  it("sportKey matches as case-insensitive substring of the label", () => {
    expect(filterPickupSessions(data, { sportKey: "soccer" })).toHaveLength(2);
    expect(filterPickupSessions(data, { sportKey: "mens" }).map((x) => x.id)).toEqual(["b"]);
  });
});
