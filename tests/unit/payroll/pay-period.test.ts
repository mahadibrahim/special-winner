import { describe, it, expect } from "vitest";
import { resolvePayPeriodBoundsUtc } from "@/lib/payroll/pay-period";

const TZ = "America/New_York";

describe("resolvePayPeriodBoundsUtc", () => {
  it("resolves a same-day period entirely within EST", () => {
    const { startUtc, endUtc } = resolvePayPeriodBoundsUtc(
      "2026-12-15",
      "2026-12-15",
      TZ,
    );
    expect(startUtc.toISOString()).toBe("2026-12-15T05:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-12-16T04:59:59.999Z");
  });

  it("resolves a multi-day period entirely within EDT", () => {
    const { startUtc, endUtc } = resolvePayPeriodBoundsUtc(
      "2026-08-01",
      "2026-08-14",
      TZ,
    );
    expect(startUtc.toISOString()).toBe("2026-08-01T04:00:00.000Z");
    expect(endUtc.toISOString()).toBe("2026-08-15T03:59:59.999Z");
  });

  it("is DST-correct across the spring-forward week (2026-03-08): each boundary resolves in its own offset", () => {
    // 2026-03-08 is the spring-forward Sunday in the US (2:00 AM -> 3:00 AM).
    // A period starting the Monday before (still EST, UTC-5) and ending the
    // Sunday after (already EDT, UTC-4) must resolve each bound from its own
    // calendar date's offset, not from a single day-count-shifted instant.
    const { startUtc, endUtc } = resolvePayPeriodBoundsUtc(
      "2026-03-02", // Monday, EST (UTC-5)
      "2026-03-08", // spring-forward Sunday, EDT by end of day (UTC-4)
      TZ,
    );
    // 2026-03-02T00:00 EST -> 05:00 UTC
    expect(startUtc.toISOString()).toBe("2026-03-02T05:00:00.000Z");
    // 2026-03-08T23:59:59.999 EDT -> 2026-03-09T03:59:59.999 UTC
    expect(endUtc.toISOString()).toBe("2026-03-09T03:59:59.999Z");
  });

  it("throws when 'to' is before 'from'", () => {
    expect(() =>
      resolvePayPeriodBoundsUtc("2026-03-10", "2026-03-01", TZ),
    ).toThrow(/before/);
  });

  it("does not throw for a single-day period (from === to)", () => {
    expect(() =>
      resolvePayPeriodBoundsUtc("2026-03-10", "2026-03-10", TZ),
    ).not.toThrow();
  });
});
