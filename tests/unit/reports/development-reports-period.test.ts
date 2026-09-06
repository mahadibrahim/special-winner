/**
 * Pure period-decision coverage for the development-reports monthly cron
 * (Phase 3 S6). `computeReportPeriod` decides, for a given cron fire time,
 * whether to send the monthly SUBSET report (for the month that just
 * closed) or the quarterly FULL report (for the quarter that just closed —
 * fires INSTEAD of a monthly subset for that quarter's last month).
 *
 * Exhaustive fixed-date coverage here is what proves the "quarter months
 * Jan/Apr/Jul/Oct send quarterly instead of monthly" decision (brief
 * requirement) works correctly for all four boundaries, without depending
 * on which month the test suite happens to run in — see
 * tests/api/development/development-reports-cron.test.ts for the live-DB
 * integration coverage, which drives `runDevelopmentReports` directly with
 * both a real "whatever period is currently closed" monthly fixture and a
 * synthetic past quarter (so it isn't gated on the calendar either).
 */
import { describe, it, expect } from "vitest";
import { computeReportPeriod, emailTypeForPeriod } from "@/lib/reports/development-reports";

describe("computeReportPeriod — monthly vs quarterly branch", () => {
  it("a non-quarter-boundary month reports the monthly subset for the closed month", () => {
    // now = Feb 1, 2026 -> closed month = Jan 2026 (month 1, not a multiple of 3).
    const period = computeReportPeriod(new Date("2026-02-01T13:00:00Z"));
    expect(period.kind).toBe("monthly");
    if (period.kind !== "monthly") throw new Error("unreachable");
    expect(period.periodKey).toBe("2026-01");
    expect(period.label).toBe("January 2026");
    expect(period.start.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-02-01T00:00:00.000Z");
  });

  it("August close (September 1st) is monthly, not quarterly", () => {
    const period = computeReportPeriod(new Date("2026-09-01T13:00:00Z"));
    expect(period.kind).toBe("monthly");
    if (period.kind !== "monthly") throw new Error("unreachable");
    expect(period.periodKey).toBe("2026-08");
    expect(period.label).toBe("August 2026");
  });

  for (const [runMonth, closedQuarterKey, closedQuarterLabel, expectedMonths] of [
    ["2026-01-01T13:00:00Z", "2025-Q4", "Q4 2025", ["2025-10", "2025-11", "2025-12"]],
    ["2026-04-01T13:00:00Z", "2026-Q1", "Q1 2026", ["2026-01", "2026-02", "2026-03"]],
    ["2026-07-01T13:00:00Z", "2026-Q2", "Q2 2026", ["2026-04", "2026-05", "2026-06"]],
    ["2026-10-01T13:00:00Z", "2026-Q3", "Q3 2026", ["2026-07", "2026-08", "2026-09"]],
  ] as const) {
    it(`cron firing on ${runMonth} sends the quarterly report for ${closedQuarterKey}`, () => {
      const period = computeReportPeriod(new Date(runMonth));
      expect(period.kind).toBe("quarterly");
      if (period.kind !== "quarterly") throw new Error("unreachable");
      expect(period.quarterKey).toBe(closedQuarterKey);
      expect(period.label).toBe(closedQuarterLabel);
      expect(period.months).toEqual(expectedMonths);
    });
  }

  it("quarterly period start/end spans exactly the 3 closed months", () => {
    const period = computeReportPeriod(new Date("2026-01-01T13:00:00Z"));
    if (period.kind !== "quarterly") throw new Error("unreachable");
    expect(period.start.toISOString()).toBe("2025-10-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("year boundary: December close (January 1st) resolves to the PRIOR year's Q4", () => {
    const period = computeReportPeriod(new Date("2027-01-01T13:00:00Z"));
    expect(period.kind).toBe("quarterly");
    if (period.kind !== "quarterly") throw new Error("unreachable");
    expect(period.quarterKey).toBe("2026-Q4");
  });
});

describe("emailTypeForPeriod", () => {
  it("monthly periods use the dev_report_<periodKey> shape", () => {
    const period = computeReportPeriod(new Date("2026-02-01T13:00:00Z"));
    expect(emailTypeForPeriod(period)).toBe("dev_report_2026-01");
  });

  it("quarterly periods use the dev_report_<quarterKey> shape", () => {
    const period = computeReportPeriod(new Date("2026-01-01T13:00:00Z"));
    expect(emailTypeForPeriod(period)).toBe("dev_report_2025-Q4");
  });

  it("both shapes fit the email_logs.email_type varchar(50) column comfortably", () => {
    const monthly = computeReportPeriod(new Date("2026-02-01T13:00:00Z"));
    const quarterly = computeReportPeriod(new Date("2026-01-01T13:00:00Z"));
    expect(emailTypeForPeriod(monthly).length).toBeLessThanOrEqual(50);
    expect(emailTypeForPeriod(quarterly).length).toBeLessThanOrEqual(50);
  });
});
