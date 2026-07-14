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
});
