/**
 * Unit: the pure derivation behind the admin rental calendar - slot
 * classification, calendar-month arithmetic, and prime-time occupancy.
 */
import { describe, it, expect } from "vitest";
import {
  busyMinutesInWindow,
  classifySlot,
  dayHourWindow,
  dayPrimeFill,
  hourLabel,
  indexByField,
  monthDates,
  monthLeadingBlanks,
  monthRange,
  monthOf,
  shiftMonth,
  summarizeCounts,
  tallyStates,
  type CalendarBusy,
  type CalendarQuote,
  type CalendarVenue,
} from "@/lib/rentals/calendar-view";

const VENUE = "11111111-1111-4111-8111-111111111111";
const TZ = "America/New_York";

const busy = (over: Partial<CalendarBusy> = {}): CalendarBusy => ({
  venueId: VENUE,
  fieldNumber: 1,
  startsAt: "2044-01-13T01:00:00.000Z", // 2044-01-12 8pm ET
  endsAt: "2044-01-13T02:00:00.000Z",
  sourceType: "rental",
  sourceId: "r1",
  label: "Thunder FC",
  ...over,
});

const quote = (over: Partial<CalendarQuote> = {}): CalendarQuote => ({
  venueId: VENUE,
  fieldNumber: 1,
  startsAt: "2044-01-20T01:00:00.000Z",
  endsAt: "2044-01-20T02:00:00.000Z",
  blockId: "b1",
  label: "Rival United",
  ...over,
});

const at = (iso: string) => Date.parse(iso);

describe("classifySlot", () => {
  it("reports a ledger rental as booked with its label", () => {
    const index = indexByField({ busy: [busy()], quotes: [] });
    const s = classifySlot(
      index,
      VENUE,
      1,
      at("2044-01-13T01:00:00.000Z"),
      at("2044-01-13T02:00:00.000Z"),
    );
    expect(s.state).toBe("rental");
    expect(s.label).toBe("Thunder FC");
  });

  it("collapses games, reserves and external holds into one reserved state", () => {
    for (const sourceType of ["game", "maintenance", "external", "drop_in", "practice"] as const) {
      const index = indexByField({
        busy: [busy({ sourceType, sourceId: null, label: "Winter league" })],
        quotes: [],
      });
      const s = classifySlot(
        index,
        VENUE,
        1,
        at("2044-01-13T01:00:00.000Z"),
        at("2044-01-13T02:00:00.000Z"),
      );
      expect(s.state).toBe("reserved");
      expect(s.label).toBe("Winter league");
    }
  });

  it("reports a live quote marker when the ledger is clear", () => {
    const index = indexByField({ busy: [], quotes: [quote()] });
    const s = classifySlot(
      index,
      VENUE,
      1,
      at("2044-01-20T01:00:00.000Z"),
      at("2044-01-20T02:00:00.000Z"),
    );
    expect(s.state).toBe("quoted");
    expect(s.label).toBe("Rival United");
  });

  it("prefers a hard ledger claim over a soft quote on the same slot", () => {
    const index = indexByField({
      busy: [busy({ startsAt: quote().startsAt, endsAt: quote().endsAt })],
      quotes: [quote()],
    });
    const s = classifySlot(
      index,
      VENUE,
      1,
      at("2044-01-20T01:00:00.000Z"),
      at("2044-01-20T02:00:00.000Z"),
    );
    expect(s.state).toBe("rental");
  });

  it("leaves another field and another venue open", () => {
    const index = indexByField({ busy: [busy()], quotes: [] });
    expect(
      classifySlot(index, VENUE, 2, at("2044-01-13T01:00:00.000Z"), at("2044-01-13T02:00:00.000Z"))
        .state,
    ).toBe("open");
    expect(
      classifySlot(index, "other", 1, at("2044-01-13T01:00:00.000Z"), at("2044-01-13T02:00:00.000Z"))
        .state,
    ).toBe("open");
  });

  it("treats an abutting claim as open (half-open intervals)", () => {
    const index = indexByField({ busy: [busy()], quotes: [] });
    const s = classifySlot(
      index,
      VENUE,
      1,
      at("2044-01-13T02:00:00.000Z"),
      at("2044-01-13T03:00:00.000Z"),
    );
    expect(s.state).toBe("open");
  });
});

describe("calendar-month arithmetic", () => {
  it("advances by calendar month across a year boundary", () => {
    expect(shiftMonth({ year: 2044, month: 11 }, 1)).toEqual({ year: 2045, month: 0 });
    expect(shiftMonth({ year: 2044, month: 0 }, -1)).toEqual({ year: 2043, month: 11 });
  });

  it("enumerates a leap February correctly", () => {
    const dates = monthDates({ year: 2044, month: 1 });
    expect(dates).toHaveLength(29);
    expect(dates[0]).toBe("2044-02-01");
    expect(dates[28]).toBe("2044-02-29");
  });

  it("returns the month's inclusive endpoint range", () => {
    expect(monthRange({ year: 2044, month: 0 })).toEqual({
      from: "2044-01-01",
      to: "2044-01-31",
    });
  });

  it("offsets the grid by the 1st's weekday", () => {
    // 2044-01-01 is a Friday.
    expect(monthLeadingBlanks({ year: 2044, month: 0 })).toBe(5);
  });

  it("round-trips a date string to its month", () => {
    expect(monthOf("2044-03-17")).toEqual({ year: 2044, month: 2 });
  });
});

describe("busyMinutesInWindow", () => {
  it("clips claims to the window", () => {
    const minutes = busyMinutesInWindow(
      [{ startMs: at("2044-01-13T00:00:00.000Z"), endMs: at("2044-01-13T02:00:00.000Z") }],
      at("2044-01-13T01:00:00.000Z"),
      at("2044-01-13T03:00:00.000Z"),
    );
    expect(minutes).toBe(60);
  });

  it("counts overlapping claims once", () => {
    const minutes = busyMinutesInWindow(
      [
        { startMs: at("2044-01-13T01:00:00.000Z"), endMs: at("2044-01-13T02:00:00.000Z") },
        { startMs: at("2044-01-13T01:30:00.000Z"), endMs: at("2044-01-13T02:30:00.000Z") },
      ],
      at("2044-01-13T00:00:00.000Z"),
      at("2044-01-13T04:00:00.000Z"),
    );
    expect(minutes).toBe(90);
  });

  it("returns zero when nothing intersects", () => {
    expect(
      busyMinutesInWindow(
        [{ startMs: at("2044-01-13T05:00:00.000Z"), endMs: at("2044-01-13T06:00:00.000Z") }],
        at("2044-01-13T01:00:00.000Z"),
        at("2044-01-13T02:00:00.000Z"),
      ),
    ).toBe(0);
  });
});

describe("dayPrimeFill", () => {
  const venues: CalendarVenue[] = [
    {
      id: VENUE,
      name: "Worthington",
      fieldNumbers: [1, 2],
      rentalOpenMinute: 960,
      rentalCloseMinute: 1440,
    },
  ];

  it("counts one booked prime hour against two fields of six", () => {
    const index = indexByField({ busy: [busy()], quotes: [] });
    const fill = dayPrimeFill(index, venues, "2044-01-12", TZ);
    expect(fill.totalMinutes).toBe(720); // 6 prime hours x 2 fields
    expect(fill.busyMinutes).toBe(60);
    expect(fill.openHours).toBe(11);
    expect(fill.fillRatio).toBeCloseTo(60 / 720);
  });

  it("is all open on a day with nothing on it", () => {
    const index = indexByField({ busy: [], quotes: [] });
    const fill = dayPrimeFill(index, venues, "2044-01-13", TZ);
    expect(fill.busyMinutes).toBe(0);
    expect(fill.openHours).toBe(12);
  });

  it("ignores claims outside the prime window", () => {
    const index = indexByField({
      busy: [
        busy({
          startsAt: "2044-01-12T18:00:00.000Z", // 1pm ET
          endsAt: "2044-01-12T19:00:00.000Z",
        }),
      ],
      quotes: [],
    });
    expect(dayPrimeFill(index, venues, "2044-01-12", TZ).busyMinutes).toBe(0);
  });
});

describe("dayHourWindow", () => {
  it("spans the widest configured rental window", () => {
    expect(
      dayHourWindow([
        { id: "a", name: "A", fieldNumbers: [1], rentalOpenMinute: 900, rentalCloseMinute: 1380 },
        { id: "b", name: "B", fieldNumbers: [1], rentalOpenMinute: 960, rentalCloseMinute: 1440 },
      ]),
    ).toEqual({ openMinute: 900, closeMinute: 1440 });
  });

  it("falls back to 4pm-midnight when venues leave hours unset", () => {
    expect(
      dayHourWindow([
        { id: "a", name: "A", fieldNumbers: [1], rentalOpenMinute: null, rentalCloseMinute: null },
      ]),
    ).toEqual({ openMinute: 960, closeMinute: 1440 });
  });

  it("falls back rather than emitting an empty window", () => {
    expect(
      dayHourWindow([
        { id: "a", name: "A", fieldNumbers: [1], rentalOpenMinute: 1200, rentalCloseMinute: 1200 },
      ]),
    ).toEqual({ openMinute: 960, closeMinute: 1440 });
  });
});

describe("labels", () => {
  it("formats hour labels around noon and midnight", () => {
    expect(hourLabel(0)).toBe("12 AM");
    expect(hourLabel(720)).toBe("12 PM");
    expect(hourLabel(1200)).toBe("8 PM");
    expect(hourLabel(1440)).toBe("12 AM");
  });

  it("summarizes only the non-empty buckets", () => {
    const counts = tallyStates(["open", "open", "rental", "quoted"]);
    expect(counts).toEqual({ open: 2, rental: 1, quoted: 1, reserved: 0 });
    expect(summarizeCounts(counts)).toBe("2 open · 1 booked · 1 quoted");
    expect(summarizeCounts(tallyStates([]))).toBe("no dates");
  });
});
