import { describe, it, expect } from "vitest";
import {
  deriveStatusPill,
  deriveDayKey,
  scarcityThreshold,
  DAY_KEYS,
  type SeasonForDerive,
} from "@/lib/programs/derive";

function season(overrides: Partial<SeasonForDerive> = {}): SeasonForDerive {
  return {
    startDate: "2026-09-12", // a Saturday
    endDate: "2026-11-07",
    registeredCount: 0,
    maxParticipants: null,
    pricingMode: "per_individual",
    program: { programType: "league", audienceType: "adults" },
    ageGroup: null,
    ...overrides,
  };
}

describe("deriveStatusPill", () => {
  it("shows Forming for a forming season before any capacity branch", () => {
    expect(deriveStatusPill(season({ status: "forming" }))).toEqual({
      label: "Forming",
      tone: "forming",
    });
    // Even a full forming season stays Forming, never Open/Sold out.
    expect(
      deriveStatusPill(season({ status: "forming", maxParticipants: 10, registeredCount: 10 })),
    ).toEqual({ label: "Forming", tone: "forming" });
  });

  it("shows Open when uncapped", () => {
    expect(deriveStatusPill(season({ status: "open" }))).toEqual({ label: "Open", tone: "open" });
  });

  it("shows Sold out at zero remaining — never 'Only 0 left'", () => {
    const pill = deriveStatusPill(season({ maxParticipants: 20, registeredCount: 20 }));
    expect(pill).toEqual({ label: "Sold out", tone: "soldout" });
  });

  it("shows '{n} spots left' inside the scarcity threshold", () => {
    // cap 20 → threshold max(3, 5) = 5
    expect(deriveStatusPill(season({ maxParticipants: 20, registeredCount: 15 }))).toEqual({
      label: "5 spots left",
      tone: "last",
    });
    expect(deriveStatusPill(season({ maxParticipants: 20, registeredCount: 19 }))).toEqual({
      label: "1 spot left",
      tone: "last",
    });
  });

  it("uses max(3, 25% of capacity) as the threshold", () => {
    expect(scarcityThreshold(8)).toBe(3);
    expect(scarcityThreshold(20)).toBe(5);
    expect(scarcityThreshold(100)).toBe(25);
    // cap 8 → threshold 3; 4 remaining is NOT scarce (fill 50% → Now enrolling)
    expect(deriveStatusPill(season({ maxParticipants: 8, registeredCount: 4 }))).toEqual({
      label: "Now enrolling",
      tone: "open",
    });
    expect(deriveStatusPill(season({ maxParticipants: 8, registeredCount: 5 }))).toEqual({
      label: "3 spots left",
      tone: "last",
    });
  });

  it("keeps the mid-fill bands above the scarcity threshold", () => {
    // cap 100, 60 registered → 40 remaining > 25 threshold, fill 60% → Now enrolling.
    // (The ≥80% "Filling up" band is effectively superseded by the 25% scarcity
    // threshold — at 80% full, remaining ≤ 20% < 25% — and only survives as a
    // safety branch.)
    expect(deriveStatusPill(season({ maxParticipants: 100, registeredCount: 60 }))).toEqual({
      label: "Now enrolling",
      tone: "open",
    });
    expect(deriveStatusPill(season({ maxParticipants: 100, registeredCount: 75 }))).toEqual({
      label: "25 spots left",
      tone: "last",
    });
  });
});

describe("deriveDayKey", () => {
  it("prefers the structured dayOfWeek", () => {
    expect(deriveDayKey(season({ dayOfWeek: "thu" }))).toBe("thu");
    expect(deriveDayKey(season({ dayOfWeek: "SUN" }))).toBe("sun");
  });

  it("falls back to the start date's weekday", () => {
    expect(deriveDayKey(season())).toBe("sat"); // 2026-09-12 is a Saturday
    expect(deriveDayKey(season({ startDate: "2026-09-14" }))).toBe("mon");
    expect(deriveDayKey(season({ startDate: "2026-09-13" }))).toBe("sun");
  });

  it("ignores junk dayOfWeek values", () => {
    expect(deriveDayKey(season({ dayOfWeek: "weekend" }))).toBe("sat");
  });

  it("DAY_KEYS is Mon→Sun", () => {
    expect(DAY_KEYS).toEqual(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]);
  });
});
