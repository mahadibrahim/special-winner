import { describe, it, expect } from "vitest";
import { resolveConsentGate } from "@/lib/sms/send";

/**
 * The four-state consent matrix sendSms enforces before every send:
 * phone_opt_ins.status (opted_out / pending / missing / opted_in) crossed
 * with bypassOptInCheck (true / false).
 *
 * STOP suppression must be absolute: "opted_out" blocks the send in BOTH
 * bypass states. bypassOptInCheck only ever relaxes the "no opt-in yet"
 * branch (missing row or "pending"). This is the fix for the bug where
 * every bypassOptInCheck: true caller (recapture SMS, phone OTP, activity
 * nudges, walk-up welcome texts, the parked-consent cron) could text a
 * number that had already replied STOP.
 */
describe("resolveConsentGate", () => {
  it("opted_out + bypass=false: blocked", () => {
    expect(resolveConsentGate("opted_out", false)).toEqual({
      allowed: false,
      reason: "opted_out",
    });
  });

  it("opted_out + bypass=true: STILL blocked — STOP suppression is absolute", () => {
    expect(resolveConsentGate("opted_out", true)).toEqual({
      allowed: false,
      reason: "opted_out",
    });
  });

  it("pending + bypass=false: blocked as not_opted_in", () => {
    expect(resolveConsentGate("pending", false)).toEqual({
      allowed: false,
      reason: "not_opted_in",
    });
  });

  it("pending + bypass=true: allowed", () => {
    expect(resolveConsentGate("pending", true)).toEqual({ allowed: true });
  });

  it("missing row (undefined) + bypass=false: blocked as not_opted_in", () => {
    expect(resolveConsentGate(undefined, false)).toEqual({
      allowed: false,
      reason: "not_opted_in",
    });
  });

  it("missing row (undefined) + bypass=true: allowed", () => {
    expect(resolveConsentGate(undefined, true)).toEqual({ allowed: true });
  });

  it("opted_in + bypass=false: allowed", () => {
    expect(resolveConsentGate("opted_in", false)).toEqual({ allowed: true });
  });

  it("opted_in + bypass=true: allowed", () => {
    expect(resolveConsentGate("opted_in", true)).toEqual({ allowed: true });
  });
});
