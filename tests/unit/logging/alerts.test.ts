import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logAlert } from "@/lib/logging/alerts";

describe("logAlert", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it("emits exactly one JSON line on console.error", () => {
    logAlert("dropin_refund_failed", { bookingId: "abc" });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const arg = errSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe("string");
    // Single line — no embedded newlines.
    expect((arg as string).includes("\n")).toBe(false);
  });

  it("includes tag, ts (ISO), and context fields", () => {
    logAlert("rental_late_refund_failed", {
      rentalId: "r1",
      paidCents: 5000,
    });
    const line = errSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(line);
    expect(parsed.tag).toBe("rental_late_refund_failed");
    expect(parsed.rentalId).toBe("r1");
    expect(parsed.paidCents).toBe(5000);
    expect(typeof parsed.ts).toBe("string");
    // Valid ISO timestamp.
    expect(Number.isFinite(Date.parse(parsed.ts))).toBe(true);
  });

  it("works with no context", () => {
    logAlert("dropin_refund_failed");
    const parsed = JSON.parse(errSpy.mock.calls[0]?.[0] as string);
    expect(parsed.tag).toBe("dropin_refund_failed");
    expect(typeof parsed.ts).toBe("string");
  });

  it("does not let context override the fixed `tag` and `ts` fields", () => {
    logAlert("dropin_refund_failed", {
      tag: "evil_override",
      ts: "evil_ts",
      bookingId: "still-shows-up",
    });
    const parsed = JSON.parse(errSpy.mock.calls[0]?.[0] as string);
    expect(parsed.tag).toBe("dropin_refund_failed");
    expect(parsed.ts).not.toBe("evil_ts");
    expect(parsed.bookingId).toBe("still-shows-up");
  });
});
