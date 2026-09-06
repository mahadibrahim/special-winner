/**
 * Pure coverage for `resolveOverridePeriod` (F2 — the `?period=` ops
 * recovery override on POST /api/cron/send-development-reports). No DB, no
 * HTTP — see tests/api/development/development-reports-cron.test.ts for the
 * live-endpoint 422 coverage and for the monthly regression suite that now
 * runs unconditionally year-round via this same override (F3).
 */
import { describe, it, expect } from "vitest";
import {
  computeReportPeriod,
  emailTypeForPeriod,
  InvalidPeriodOverrideError,
  resolveOverridePeriod,
} from "@/lib/reports/development-reports";

describe("resolveOverridePeriod", () => {
  it("resolves a closed monthly period identically to computeReportPeriod's own shape", () => {
    // computeReportPeriod(2026-02-01) resolves to the closed month 2026-01.
    const viaComputed = computeReportPeriod(new Date("2026-02-01T13:00:00Z"));
    const viaOverride = resolveOverridePeriod("2026-01", new Date("2026-02-01T13:00:00Z"));
    expect(viaOverride).toEqual(viaComputed);
  });

  it("resolves a closed quarterly period identically to computeReportPeriod's own shape", () => {
    // computeReportPeriod(2026-01-01) resolves to the closed quarter 2025-Q4.
    const viaComputed = computeReportPeriod(new Date("2026-01-01T13:00:00Z"));
    const viaOverride = resolveOverridePeriod("2025-Q4", new Date("2026-01-01T13:00:00Z"));
    expect(viaOverride).toEqual(viaComputed);
    expect(emailTypeForPeriod(viaOverride)).toBe("dev_report_2025-Q4");
  });

  it("accepts a period that closed exactly at `now` (boundary-inclusive, not future)", () => {
    const period = resolveOverridePeriod("2019-01", new Date("2019-02-01T00:00:00.000Z"));
    expect(period.kind).toBe("monthly");
  });

  it("rejects a malformed shape (neither YYYY-MM nor YYYY-Qn)", () => {
    expect(() => resolveOverridePeriod("not-a-period", new Date())).toThrow(InvalidPeriodOverrideError);
    expect(() => resolveOverridePeriod("2026", new Date())).toThrow(InvalidPeriodOverrideError);
    expect(() => resolveOverridePeriod("2026-Q5", new Date())).toThrow(InvalidPeriodOverrideError);
    expect(() => resolveOverridePeriod("2026-13", new Date())).toThrow(InvalidPeriodOverrideError);
  });

  it("rejects a period that has not closed yet (future month)", () => {
    expect(() => resolveOverridePeriod("2099-01", new Date("2026-01-01T00:00:00.000Z"))).toThrow(
      InvalidPeriodOverrideError,
    );
  });

  it("rejects a period that has not closed yet (future quarter)", () => {
    expect(() => resolveOverridePeriod("2099-Q1", new Date("2026-01-01T00:00:00.000Z"))).toThrow(
      InvalidPeriodOverrideError,
    );
  });

  it("rejects the currently-open month (has not closed as of `now`)", () => {
    // `now` falls inside 2026-02, so 2026-02 itself hasn't closed yet.
    expect(() => resolveOverridePeriod("2026-02", new Date("2026-02-15T00:00:00.000Z"))).toThrow(
      InvalidPeriodOverrideError,
    );
  });
});

describe("resolveOverridePeriod — quarter-collapse (mirrors computeReportPeriod's closedMonth % 3 === 0 rule)", () => {
  it("?period=YYYY-12 (Dec) collapses to that year's Q4 quarterly period, not a bare monthly", () => {
    const now = new Date("2020-01-01T00:00:00.000Z");
    const period = resolveOverridePeriod("2019-12", now);
    expect(period.kind).toBe("quarterly");
    if (period.kind !== "quarterly") throw new Error("unreachable");
    expect(period.quarterKey).toBe("2019-Q4");
    expect(period.months).toEqual(["2019-10", "2019-11", "2019-12"]);
    expect(period.label).toBe("Q4 2019");
    expect(period.start.toISOString()).toBe("2019-10-01T00:00:00.000Z");
    expect(period.end.toISOString()).toBe("2020-01-01T00:00:00.000Z");
    expect(emailTypeForPeriod(period)).toBe("dev_report_2019-Q4");

    // Must match what computeReportPeriod itself would produce for a cron
    // firing right after this quarter closed — the whole point of the
    // collapse rule is "identical execution" on these months.
    const viaComputed = computeReportPeriod(new Date("2020-01-01T13:00:00Z"));
    expect(period).toEqual(viaComputed);
  });

  it("?period=YYYY-03/06/09 (the other quarter-ending months) also collapse to quarterly", () => {
    expect(resolveOverridePeriod("2019-03", new Date("2019-04-01T00:00:00.000Z")).kind).toBe("quarterly");
    expect(resolveOverridePeriod("2019-06", new Date("2019-07-01T00:00:00.000Z")).kind).toBe("quarterly");
    expect(resolveOverridePeriod("2019-09", new Date("2019-10-01T00:00:00.000Z")).kind).toBe("quarterly");

    const q1 = resolveOverridePeriod("2019-03", new Date("2019-04-01T00:00:00.000Z"));
    if (q1.kind !== "quarterly") throw new Error("unreachable");
    expect(q1.quarterKey).toBe("2019-Q1");
  });

  it("a mid-quarter month (not Mar/Jun/Sep/Dec) stays a standalone monthly period", () => {
    const period = resolveOverridePeriod("2019-11", new Date("2019-12-01T00:00:00.000Z"));
    expect(period.kind).toBe("monthly");
    if (period.kind !== "monthly") throw new Error("unreachable");
    expect(period.periodKey).toBe("2019-11");
    expect(emailTypeForPeriod(period)).toBe("dev_report_2019-11");
  });

  it("a quarter-ending month's future-rejection still applies before the collapse", () => {
    expect(() => resolveOverridePeriod("2099-12", new Date("2026-01-01T00:00:00.000Z"))).toThrow(
      InvalidPeriodOverrideError,
    );
  });
});
