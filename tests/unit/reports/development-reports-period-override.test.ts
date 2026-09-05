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
