import { describe, it, expect, vi, afterEach } from "vitest";
import { deriveDeadline, type SeasonForDerive } from "@/lib/programs/derive";

function seasonWith(registrationCloses: string | null): SeasonForDerive {
  return {
    startDate: "2026-06-01",
    endDate: "2026-08-01",
    registeredCount: 0,
    maxParticipants: null,
    pricingMode: "per_individual",
    registrationCloses,
    program: { programType: "league", audienceType: "parents" },
    ageGroup: null,
  };
}

describe("deriveDeadline", () => {
  afterEach(() => vi.useRealTimers());

  it("returns null when there is no registrationCloses date", () => {
    expect(deriveDeadline(seasonWith(null))).toBeNull();
  });

  it("returns a non-urgent label when the deadline is far off", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-05-01T12:00:00Z"));
    const result = deriveDeadline(seasonWith("2026-06-15"));
    expect(result).toEqual({ label: "Closes Jun 15", urgent: false });
  });

  it("marks the deadline urgent when it is 7 or fewer days away", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-10T12:00:00Z"));
    const result = deriveDeadline(seasonWith("2026-06-15"));
    expect(result?.urgent).toBe(true);
    expect(result?.label).toBe("Closes Jun 15");
  });

  it("is not urgent exactly 8 days out", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-07T12:00:00Z"));
    expect(deriveDeadline(seasonWith("2026-06-15"))?.urgent).toBe(false);
  });
});
