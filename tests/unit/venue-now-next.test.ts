import { describe, it, expect } from "vitest";
import { deriveNowNext } from "@/lib/venue/derive-now-next";
import type { VenueTodaySession } from "@/lib/venue/today-types";

const s = (id: string, startsAt: string, endsAt: string): VenueTodaySession => ({
  id, kind: "dropin", spaceId: "sp", spaceName: "Field 1", title: id,
  startsAt, endsAt, capacity: 20, booked: 9, checkedIn: 2, waiversOut: 3, photosMissing: 0, refAssigned: null,
});

describe("deriveNowNext", () => {
  const now = Date.parse("2026-06-19T11:00:00Z");
  const sessions = [
    s("past", "2026-06-19T09:00:00Z", "2026-06-19T10:00:00Z"),
    s("live", "2026-06-19T10:30:00Z", "2026-06-19T12:00:00Z"),
    s("soon", "2026-06-19T13:00:00Z", "2026-06-19T15:00:00Z"),
    s("later", "2026-06-19T17:00:00Z", "2026-06-19T20:00:00Z"),
  ];
  it("puts in-progress sessions in 'now'", () => {
    expect(deriveNowNext(sessions, now).now.map((x) => x.id)).toEqual(["live"]);
  });
  it("puts upcoming sessions in 'next', ascending, capped at 4", () => {
    expect(deriveNowNext(sessions, now).next.map((x) => x.id)).toEqual(["soon", "later"]);
  });
});
