import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logAlert } from "@/lib/logging/alerts";
import { captureServerException } from "@/lib/observability/server-error";

// logAlert routes every alert to PostHog via captureServerException. Mock it
// so the unit test asserts the routing contract without a real network call.
vi.mock("@/lib/observability/server-error", () => ({
  captureServerException: vi.fn().mockResolvedValue(undefined),
}));

describe("logAlert", () => {
  let errSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(captureServerException).mockClear();
  });

  afterEach(() => {
    errSpy.mockRestore();
  });

  it("emits exactly one JSON line on console.error", async () => {
    await logAlert("dropin_refund_failed", { bookingId: "abc" });
    expect(errSpy).toHaveBeenCalledTimes(1);
    const arg = errSpy.mock.calls[0]?.[0];
    expect(typeof arg).toBe("string");
    // Single line — no embedded newlines.
    expect((arg as string).includes("\n")).toBe(false);
  });

  it("includes tag, ts (ISO), and context fields", async () => {
    await logAlert("rental_late_refund_failed", {
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

  it("works with no context", async () => {
    await logAlert("dropin_refund_failed");
    const parsed = JSON.parse(errSpy.mock.calls[0]?.[0] as string);
    expect(parsed.tag).toBe("dropin_refund_failed");
    expect(typeof parsed.ts).toBe("string");
  });

  it("does not let context override the fixed `tag` and `ts` fields", async () => {
    await logAlert("dropin_refund_failed", {
      tag: "evil_override",
      ts: "evil_ts",
      bookingId: "still-shows-up",
    });
    const parsed = JSON.parse(errSpy.mock.calls[0]?.[0] as string);
    expect(parsed.tag).toBe("dropin_refund_failed");
    expect(parsed.ts).not.toBe("evil_ts");
    expect(parsed.bookingId).toBe("still-shows-up");
  });

  it("routes the alert to PostHog via captureServerException", async () => {
    await logAlert("dropin_refund_failed", {
      bookingId: "abc",
      error: "stripe boom",
    });
    expect(captureServerException).toHaveBeenCalledTimes(1);
    const [err, ctx] = vi.mocked(captureServerException).mock.calls[0]!;
    // The string `error` field is wrapped into an Error for the exception feed.
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe("stripe boom");
    expect(ctx.component).toBe("alert/dropin_refund_failed");
    expect(ctx.metadata?.alert_tag).toBe("dropin_refund_failed");
    expect(ctx.metadata?.bookingId).toBe("abc");
  });
});
