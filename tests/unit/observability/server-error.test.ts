import { describe, it, expect, vi, beforeEach } from "vitest";
import { captureServerException } from "@/lib/observability/server-error";

const mockCaptureException = vi.fn();
const mockCapture = vi.fn();

vi.mock("@/lib/posthog-server", () => ({
  getPostHogServer: () => ({
    captureException: mockCaptureException,
    capture: mockCapture,
  }),
}));

describe("captureServerException", () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
    mockCapture.mockReset();
  });

  it("calls PostHog captureException with component as distinct id", async () => {
    const err = new Error("db timeout");
    await captureServerException(err, {
      component: "cron/expire-pending-claims",
      metadata: { user_id: "u_1" },
    });

    expect(mockCaptureException).toHaveBeenCalledOnce();
    const [capturedErr, distinctId, props] =
      mockCaptureException.mock.calls[0];
    expect(capturedErr).toBe(err);
    expect(distinctId).toBe("cron/expire-pending-claims");
    expect(props.component).toBe("cron/expire-pending-claims");
    expect(props.$exception_source).toBe("cron/expire-pending-claims");
    expect(props.user_id).toBe("u_1");
  });

  it("emits a server_exception event with component + error_message", async () => {
    await captureServerException(new Error("kaboom"), {
      component: "stripe-handler/refund-email",
    });

    expect(mockCapture).toHaveBeenCalledOnce();
    const [arg] = mockCapture.mock.calls[0];
    expect(arg.event).toBe("server_exception");
    expect(arg.distinctId).toBe("stripe-handler/refund-email");
    expect(arg.properties.component).toBe("stripe-handler/refund-email");
    expect(arg.properties.error_message).toBe("kaboom");
  });

  it("serializes non-Error throws to string", async () => {
    await captureServerException("string-thrown", {
      component: "cron/test",
    });
    const [arg] = mockCapture.mock.calls[0];
    expect(arg.properties.error_message).toBe("string-thrown");
  });

  it("never throws even if the underlying client throws", async () => {
    mockCaptureException.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });
    await expect(
      captureServerException(new Error("x"), { component: "cron/test" }),
    ).resolves.toBeUndefined();
  });

  it("never throws even if the capture call throws", async () => {
    mockCapture.mockImplementationOnce(() => {
      throw new Error("posthog down");
    });
    await expect(
      captureServerException(new Error("x"), { component: "cron/test" }),
    ).resolves.toBeUndefined();
  });

  it("merges metadata into both the exception props and the event props", async () => {
    await captureServerException(new Error("x"), {
      component: "cron/foo",
      metadata: { tenant_id: "org_1", processed: 5 },
    });
    const [, , exProps] = mockCaptureException.mock.calls[0];
    expect(exProps.tenant_id).toBe("org_1");
    expect(exProps.processed).toBe(5);
    const [evt] = mockCapture.mock.calls[0];
    expect(evt.properties.tenant_id).toBe("org_1");
    expect(evt.properties.processed).toBe(5);
  });
});
