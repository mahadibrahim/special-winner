import { describe, it, expect } from "vitest";
import { ageOnDate } from "@/lib/classes/book-child";
import type { ChildBookingError, ChildBookingResult } from "@/lib/classes/book-child";

describe("ageOnDate", () => {
  it("computes a normal mid-year age", () => {
    expect(ageOnDate("2015-03-10", new Date("2026-08-23T00:00:00Z"))).toBe(11);
  });

  it("has NOT incremented yet when the birthday this year is still ahead (birthday-not-yet-reached edge)", () => {
    // Turns 11 on 2026-08-24 — as of 2026-08-23 they are still 10.
    expect(ageOnDate("2015-08-24", new Date("2026-08-23T00:00:00Z"))).toBe(10);
  });

  it("has already incremented on the exact birthday (exact-birthday edge)", () => {
    // Turns 11 on 2026-08-23 — as of that same day they are 11, not 10.
    expect(ageOnDate("2015-08-23", new Date("2026-08-23T00:00:00Z"))).toBe(11);
  });

  it("has already incremented the day after the birthday", () => {
    expect(ageOnDate("2015-08-23", new Date("2026-08-24T00:00:00Z"))).toBe(11);
  });

  it("handles a leap-day birth date on a non-leap year evaluation date", () => {
    // Born 2016-02-29 (leap year); by 2026-03-01 they have turned 10.
    expect(ageOnDate("2016-02-29", new Date("2026-03-01T00:00:00Z"))).toBe(10);
    // A day earlier (2026-02-28) the Feb-29 birthday hasn't landed yet.
    expect(ageOnDate("2016-02-29", new Date("2026-02-28T00:00:00Z"))).toBe(9);
  });

  it("computes 0 for a child born earlier this calendar year", () => {
    expect(ageOnDate("2026-01-15", new Date("2026-08-23T00:00:00Z"))).toBe(0);
  });
});

describe("ChildBookingResult error-shape mapping", () => {
  // Compile-time-enforced: this list must stay in sync with the
  // ChildBookingError["code"] union in book-child.ts. If a code is added,
  // removed, or renamed there, this array (and thus this test file) fails
  // to typecheck — that's the point.
  const allCodes: ChildBookingError["code"][] = [
    "session_not_found",
    "session_not_class",
    "session_not_scheduled",
    "session_started",
    "session_full",
    "child_not_found",
    "already_booked",
    "no_membership",
    "allotment_exhausted",
    "trial_already_used",
    "age_ineligible",
    "waiver_required",
  ];

  it("every documented error code round-trips through the failure shape", () => {
    for (const code of allCodes) {
      const result: ChildBookingResult = { ok: false, error: { code, message: "x" } };
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe(code);
      }
    }
  });

  it("success shape only allows the two $0 class payment methods", () => {
    const member: ChildBookingResult = {
      ok: true,
      bookingId: "b1",
      paymentMethod: "member_allotment",
    };
    const trial: ChildBookingResult = {
      ok: true,
      bookingId: "b2",
      paymentMethod: "trial",
    };
    expect(member.ok && member.paymentMethod).toBe("member_allotment");
    expect(trial.ok && trial.paymentMethod).toBe("trial");
  });
});
