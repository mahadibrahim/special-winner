import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  captureWebhookException,
  captureWebhookOutcome,
} from "@/lib/observability/webhook-telemetry";

// Mock the PostHog server module — the helper imports it dynamically.
const mockCaptureException = vi.fn();
const mockCapture = vi.fn();

vi.mock("@/lib/posthog-server", () => ({
  getPostHogServer: () => ({
    captureException: mockCaptureException,
    capture: mockCapture,
  }),
}));

describe("webhook telemetry", () => {
  beforeEach(() => {
    mockCaptureException.mockReset();
    mockCapture.mockReset();
  });

  describe("captureWebhookException", () => {
    it("calls PostHog captureException with the webhook label as distinct id", async () => {
      const err = new Error("boom");
      await captureWebhookException(err, {
        webhook: "stripe",
        eventType: "charge.refunded",
        eventId: "evt_123",
      });

      expect(mockCaptureException).toHaveBeenCalledOnce();
      const [capturedErr, distinctId, props] =
        mockCaptureException.mock.calls[0];
      expect(capturedErr).toBe(err);
      expect(distinctId).toBe("stripe");
      expect(props.event_type).toBe("charge.refunded");
      expect(props.event_id).toBe("evt_123");
      expect(props.webhook).toBe("stripe");
    });

    it("also emits a stripe_webhook_exception event for alert rules", async () => {
      await captureWebhookException(new Error("boom"), {
        webhook: "stripe-connect",
        eventType: "account.updated",
        eventId: "evt_456",
      });

      expect(mockCapture).toHaveBeenCalledOnce();
      const [arg] = mockCapture.mock.calls[0];
      expect(arg.event).toBe("stripe_webhook_exception");
      expect(arg.distinctId).toBe("stripe-connect");
      expect(arg.properties.webhook).toBe("stripe-connect");
      expect(arg.properties.event_type).toBe("account.updated");
      expect(arg.properties.error_message).toBe("boom");
    });

    it("falls back to '(unknown)' when eventType/eventId aren't known", async () => {
      await captureWebhookException(new Error("pre-verify failure"), {
        webhook: "stripe",
      });

      const [, , props] = mockCaptureException.mock.calls[0];
      expect(props.event_type).toBe("(unknown)");
      expect(props.event_id).toBe("(unknown)");
    });

    it("never throws even if the underlying client throws", async () => {
      mockCaptureException.mockImplementationOnce(() => {
        throw new Error("posthog down");
      });
      // Should not throw — the catch in the helper swallows.
      await expect(
        captureWebhookException(new Error("x"), { webhook: "stripe" }),
      ).resolves.toBeUndefined();
    });

    it("serializes non-Error values to a string error_message", async () => {
      await captureWebhookException("string-thrown", { webhook: "stripe" });
      const [arg] = mockCapture.mock.calls[0];
      expect(arg.properties.error_message).toBe("string-thrown");
    });
  });

  describe("captureWebhookOutcome", () => {
    it("emits a stripe_webhook_outcome event with the supplied fields", async () => {
      await captureWebhookOutcome({
        webhook: "stripe",
        outcome: "processed",
        eventType: "payment_intent.succeeded",
        eventId: "evt_789",
        metadata: { handler: "registration_payment" },
      });

      expect(mockCapture).toHaveBeenCalledOnce();
      const [arg] = mockCapture.mock.calls[0];
      expect(arg.event).toBe("stripe_webhook_outcome");
      expect(arg.distinctId).toBe("stripe");
      expect(arg.properties).toMatchObject({
        webhook: "stripe",
        outcome: "processed",
        event_type: "payment_intent.succeeded",
        event_id: "evt_789",
        handler: "registration_payment",
      });
    });

    it("never throws if the client errors", async () => {
      mockCapture.mockImplementationOnce(() => {
        throw new Error("posthog down");
      });
      await expect(
        captureWebhookOutcome({
          webhook: "stripe",
          outcome: "deduped",
          eventType: "charge.refunded",
          eventId: "evt_dup",
        }),
      ).resolves.toBeUndefined();
    });
  });
});
