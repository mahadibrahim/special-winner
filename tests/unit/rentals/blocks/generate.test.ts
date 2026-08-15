import { describe, it, expect } from "vitest";
import {
  findInBatchOverlaps,
  generateBlockSessions,
  localMinuteToUtc,
} from "@/lib/rentals/blocks/generate";

const TZ = "America/New_York";
const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";

// 1200 = 20:00 local. Tuesdays: Jan 6, Feb 17, Mar 24 2026 are all Tuesdays.
const tuesdays8pm = {
  timeZone: TZ,
  firstDate: "2026-01-06",
  lastDate: "2026-03-24",
  days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] }],
};

describe("generateBlockSessions", () => {
  it("generates one session per matching weekday, inclusive of both bounds", () => {
    const s = generateBlockSessions(tuesdays8pm);
    expect(s).toHaveLength(12);
    expect(s[0].date).toBe("2026-01-06");
    expect(s[11].date).toBe("2026-03-24");
  });

  it("keeps local wall-clock time across the March spring-forward", () => {
    // DST 2026 begins Mar 8. Jan 6 8pm is EST (UTC-5); Mar 24 8pm is EDT (UTC-4).
    const s = generateBlockSessions(tuesdays8pm);
    expect(s[0].startsAt.toISOString()).toBe("2026-01-07T01:00:00.000Z");
    expect(s[11].startsAt.toISOString()).toBe("2026-03-25T00:00:00.000Z");
  });

  it("keeps local wall-clock time across the November fall-back", () => {
    // DST 2026 ends Nov 1. Oct 27 8pm is EDT; Nov 3 8pm is EST.
    const s = generateBlockSessions({
      ...tuesdays8pm,
      firstDate: "2026-10-27",
      lastDate: "2026-11-03",
    });
    expect(s).toHaveLength(2);
    expect(s[0].startsAt.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(s[1].startsAt.toISOString()).toBe("2026-11-04T01:00:00.000Z");
  });

  it("drops excluded dates", () => {
    const s = generateBlockSessions({ ...tuesdays8pm, excludedDates: ["2026-02-17"] });
    expect(s).toHaveLength(11);
    expect(s.some((x) => x.date === "2026-02-17")).toBe(false);
  });

  it("supports several days per week with their own times and durations", () => {
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-06",
      lastDate: "2026-01-12",
      days: [
        { weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] },
        { weekday: 4, startMinute: 1260, durationMinutes: 90, venueIds: [V1] },
      ],
    });
    expect(s.map((x) => [x.date, x.startMinute, x.durationMinutes])).toEqual([
      ["2026-01-06", 1200, 60],
      ["2026-01-08", 1260, 90],
    ]);
  });

  it("emits one session per venue for a multi-field day", () => {
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-10",
      lastDate: "2026-01-10",
      days: [{ weekday: 6, startMinute: 540, durationMinutes: 240, venueIds: [V1, V2] }],
    });
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.venueId)).toEqual([V1, V2]);
    expect(s[0].endsAt.getTime() - s[0].startsAt.getTime()).toBe(4 * 3_600_000);
  });

  it("rolls a session ending at local midnight onto the next date", () => {
    // 23:00 + 90min = 24:30 local, so the end minute must not throw past 1440.
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-06",
      lastDate: "2026-01-06",
      days: [{ weekday: 2, startMinute: 1380, durationMinutes: 90, venueIds: [V1] }],
    });
    expect(s[0].startsAt.toISOString()).toBe("2026-01-07T04:00:00.000Z");
    expect(s[0].endsAt.toISOString()).toBe("2026-01-07T05:30:00.000Z");
  });

  it("returns sessions sorted by start time", () => {
    const s = generateBlockSessions({
      timeZone: TZ,
      firstDate: "2026-01-06",
      lastDate: "2026-01-09",
      days: [
        { weekday: 5, startMinute: 1200, durationMinutes: 60, venueIds: [V1] },
        { weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] },
      ],
    });
    expect(s.map((x) => x.date)).toEqual(["2026-01-06", "2026-01-09"]);
  });

  it("gives each session a key stable across regeneration", () => {
    const a = generateBlockSessions(tuesdays8pm);
    const b = generateBlockSessions(tuesdays8pm);
    expect(a.map((x) => x.key)).toEqual(b.map((x) => x.key));
    expect(a[0].key).toBe(`2026-01-06|${V1}|1200`);
  });

  it("throws when lastDate precedes firstDate", () => {
    expect(() =>
      generateBlockSessions({ ...tuesdays8pm, firstDate: "2026-03-24", lastDate: "2026-01-06" }),
    ).toThrow(/lastDate/);
  });
});

describe("localMinuteToUtc", () => {
  it("rolls minutes past midnight onto the following date", () => {
    expect(localMinuteToUtc("2026-01-06", 1470, TZ).toISOString()).toBe("2026-01-07T05:30:00.000Z");
  });
});

describe("findInBatchOverlaps", () => {
  const slot = (key: string, venueId: string, startsAt: string, endsAt: string) => ({
    key,
    venueId,
    startsAt: new Date(startsAt),
    endsAt: new Date(endsAt),
  });

  it("passes a clean batch", () => {
    expect(
      findInBatchOverlaps([
        slot("a", V1, "2026-01-06T01:00:00Z", "2026-01-06T02:00:00Z"),
        slot("b", V1, "2026-01-13T01:00:00Z", "2026-01-13T02:00:00Z"),
        slot("c", V2, "2026-01-06T01:00:00Z", "2026-01-06T02:00:00Z"),
      ]),
    ).toEqual([]);
  });

  it("treats back-to-back sessions on one field as clean", () => {
    expect(
      findInBatchOverlaps([
        slot("a", V1, "2026-01-06T01:00:00Z", "2026-01-06T02:00:00Z"),
        slot("b", V1, "2026-01-06T02:00:00Z", "2026-01-06T03:00:00Z"),
      ]),
    ).toEqual([]);
  });

  it("catches a venue listed twice: identical keys on one slot", () => {
    const dup = slot("2026-01-06|" + V1 + "|1200", V1, "2026-01-06T01:00:00Z", "2026-01-06T02:00:00Z");
    const found = findInBatchOverlaps([dup, { ...dup }]);
    expect(found).toHaveLength(1);
    expect(found[0].key).toBe(dup.key);
    expect(found[0].reason).toContain("twice");
  });

  it("catches an override landing on another session's venue and time", () => {
    const found = findInBatchOverlaps([
      slot("tue", V1, "2026-01-06T01:00:00Z", "2026-01-06T02:00:00Z"),
      slot("thu-moved", V1, "2026-01-06T01:30:00Z", "2026-01-06T02:30:00Z"),
    ]);
    expect(found).toEqual([
      {
        key: "thu-moved",
        reason: "overlaps another session in this block (tue) on the same field",
      },
    ]);
  });

  it("names the earlier session even when it swallows several later ones", () => {
    const found = findInBatchOverlaps([
      slot("long", V1, "2026-01-06T01:00:00Z", "2026-01-06T05:00:00Z"),
      slot("short-1", V1, "2026-01-06T02:00:00Z", "2026-01-06T03:00:00Z"),
      slot("short-2", V1, "2026-01-06T03:00:00Z", "2026-01-06T04:00:00Z"),
    ]);
    expect(found.map((f) => f.key)).toEqual(["short-1", "short-2"]);
    expect(found.every((f) => f.reason.includes("long"))).toBe(true);
  });

  it("separates fields: the same venue on two field numbers does not collide", () => {
    const found = findInBatchOverlaps(
      [
        slot("a", V1, "2026-01-06T01:00:00Z", "2026-01-06T02:00:00Z"),
        slot("b", V2, "2026-01-06T01:00:00Z", "2026-01-06T02:00:00Z"),
      ],
      { [V1]: 1, [V2]: 2 },
    );
    expect(found).toEqual([]);
  });

  it("catches overlaps generated from a duplicated venue in the pattern", () => {
    const sessions = generateBlockSessions({
      ...tuesdays8pm,
      days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1, V1] }],
    });
    expect(findInBatchOverlaps(sessions)).toHaveLength(sessions.length / 2);
  });
});
