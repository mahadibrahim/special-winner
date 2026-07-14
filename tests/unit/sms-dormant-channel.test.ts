import { describe, it, expect } from "vitest";
import { classifyProviderError } from "@/lib/sms/send";

describe("dormant channel classification", () => {
  it("treats 'under carrier review' as dormant, not a provider error", () => {
    // The documented response while a 10DLC registration is unapproved
    // (docs/operations/zernio-sms-unpark-checklist.md). It is not a failure —
    // the channel simply is not awake yet, and the consent must be kept.
    const err = new Error("403 Your SMS registration is still under carrier review.");
    expect(classifyProviderError(err)).toBe("channel_dormant");
  });

  it("a genuine carrier failure stays a provider_error", () => {
    expect(classifyProviderError(new Error("502 carrier failure"))).toBe("provider_error");
  });

  it("a missing sender is a configuration fault, not dormancy", () => {
    expect(
      classifyProviderError(new Error("404 No SMS-enabled number matches from")),
    ).toBe("not_configured");
  });

  describe("real Zernio client error shapes (classify by status, not wording)", () => {
    it("classifies the real wrapped dormant error as dormant", () => {
      const err = new Error(
        "Zernio SMS 403 on /sms/messages: Your SMS registration is still under carrier review.",
      );
      expect(classifyProviderError(err)).toBe("channel_dormant");
    });

    it("classifies a 403 with a non-JSON error body as dormant (the hole this fix closes)", () => {
      // zernio-sms.ts falls back to detail = "(non-JSON error body)" when the
      // response body isn't valid JSON. The wording match never fires here —
      // only the embedded HTTP status can save the consent.
      const err = new Error("Zernio SMS 403 on /sms/messages: (non-JSON error body)");
      expect(classifyProviderError(err)).toBe("channel_dormant");
    });

    it("classifies a 403 with reworded carrier text as dormant by status, not wording", () => {
      const err = new Error("Zernio SMS 403 on /sms/messages: registration pending review");
      expect(classifyProviderError(err)).toBe("channel_dormant");
    });

    it("classifies a 404 as not_configured", () => {
      const err = new Error(
        "Zernio SMS 404 on /sms/messages: No SMS-enabled number matches from",
      );
      expect(classifyProviderError(err)).toBe("not_configured");
    });

    it("classifies a 502 as provider_error, not parked forever", () => {
      const err = new Error("Zernio SMS 502 on /sms/messages: Carrier send failed");
      expect(classifyProviderError(err)).toBe("provider_error");
    });
  });
});
