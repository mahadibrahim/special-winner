import { describe, it, expect } from "vitest";
import { getSmsProvider, isSmsConfigured } from "@/lib/sms/client";

describe("SMS provider selection", () => {
  it("defaults to twilio when SMS_PROVIDER is unset", () => {
    expect(getSmsProvider({})).toBe("twilio");
  });

  it("defaults to twilio for any value other than 'zernio'", () => {
    expect(getSmsProvider({ SMS_PROVIDER: "TWILIO" })).toBe("twilio");
    expect(getSmsProvider({ SMS_PROVIDER: "sinch" })).toBe("twilio");
  });

  it("selects zernio only for the exact value 'zernio'", () => {
    expect(getSmsProvider({ SMS_PROVIDER: "zernio" })).toBe("zernio");
  });
});

describe("isSmsConfigured is provider-aware", () => {
  it("checks Twilio creds when provider is twilio", () => {
    expect(
      isSmsConfigured({
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_PHONE_NUMBER: "+16145550100",
      }),
    ).toBe(true);
    expect(isSmsConfigured({ TWILIO_ACCOUNT_SID: "AC1" })).toBe(false);
  });

  it("checks Zernio SMS creds when provider is zernio", () => {
    expect(
      isSmsConfigured({
        SMS_PROVIDER: "zernio",
        ZERNIO_API_KEY: "k",
        ZERNIO_SMS_FROM: "+16145550100",
      }),
    ).toBe(true);
    // Twilio creds present but provider is zernio and zernio creds missing → false
    expect(
      isSmsConfigured({
        SMS_PROVIDER: "zernio",
        TWILIO_ACCOUNT_SID: "AC1",
        TWILIO_AUTH_TOKEN: "tok",
        TWILIO_PHONE_NUMBER: "+16145550100",
      }),
    ).toBe(false);
  });
});
