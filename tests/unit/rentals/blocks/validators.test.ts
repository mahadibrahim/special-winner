import { describe, it, expect } from "vitest";
import { validateCreateBlockBody } from "@/lib/rentals/blocks/validators";

const V1 = "11111111-1111-1111-1111-111111111111";
const V2 = "22222222-2222-2222-2222-222222222222";
const LOC = "33333333-3333-3333-3333-333333333333";

const body = (overrides: Record<string, unknown> = {}) => ({
  locationId: LOC,
  brand: "soccerone",
  label: "Ohio Elite 03B",
  renterName: "Sam Renter",
  pattern: {
    timeZone: "America/New_York",
    firstDate: "2026-01-06",
    lastDate: "2026-03-24",
    days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1] }],
  },
  ...overrides,
});

describe("validateCreateBlockBody", () => {
  it("accepts a minimal block body", () => {
    const r = validateCreateBlockBody(body());
    expect(r.ok).toBe(true);
  });

  it("dedupes repeated venue ids on a pattern day", () => {
    const r = validateCreateBlockBody(
      body({
        pattern: {
          timeZone: "America/New_York",
          firstDate: "2026-01-06",
          lastDate: "2026-03-24",
          days: [
            { weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [V1, V2, V1] },
          ],
        },
      }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.pattern.days[0].venueIds).toEqual([V1, V2]);
  });

  it("still rejects a day with no venues at all", () => {
    const r = validateCreateBlockBody(
      body({
        pattern: {
          timeZone: "America/New_York",
          firstDate: "2026-01-06",
          lastDate: "2026-03-24",
          days: [{ weekday: 2, startMinute: 1200, durationMinutes: 60, venueIds: [] }],
        },
      }),
    );
    expect(r.ok).toBe(false);
  });
});
