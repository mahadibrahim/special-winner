import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createHash } from "node:crypto";
import {
  buildMetaEventPayload,
  normalizePhoneForMeta,
  type MetaConversionInput,
} from "@/lib/analytics/meta-capi";
import {
  isExcludedConversionEmail,
  conversionsEnabled,
  shouldSendConversion,
} from "@/lib/analytics/conversion-exclusions";

const sha = (v: string) =>
  createHash("sha256").update(v.trim().toLowerCase()).digest("hex");

const EVENT_TIME = 1_754_000_000;

function purchaseInput(
  overrides: Partial<MetaConversionInput> = {},
): MetaConversionInput {
  return {
    eventName: "Purchase",
    eventId: "pi_123",
    valueCents: 12500,
    currency: "USD",
    brand: "aspire",
    email: "buyer@example.com",
    ...overrides,
  };
}

describe("normalizePhoneForMeta", () => {
  it("prepends 1 to a US 10-digit number and strips formatting", () => {
    expect(normalizePhoneForMeta("(614) 555-0123")).toBe("16145550123");
  });

  it("keeps an 11-digit number with country code as digits", () => {
    expect(normalizePhoneForMeta("+1 614 555 0123")).toBe("16145550123");
  });

  it("rejects numbers with fewer than 10 digits", () => {
    expect(normalizePhoneForMeta("555-0123")).toBeNull();
  });
});

describe("buildMetaEventPayload", () => {
  it("hashes every identity match key per Meta spec", () => {
    const payload = buildMetaEventPayload(
      purchaseInput({
        email: " Buyer@Example.COM ",
        phone: "(614) 555-0123",
        firstName: "Jordan",
        lastName: "Smith",
        externalId: "user-uuid-1",
      }),
      EVENT_TIME,
    )!;
    const userData = payload.user_data as Record<string, unknown>;
    expect(userData.em).toEqual([sha("buyer@example.com")]);
    expect(userData.ph).toEqual([sha("16145550123")]);
    expect(userData.fn).toEqual([sha("jordan")]);
    expect(userData.ln).toEqual([sha("smith")]);
    expect(userData.external_id).toEqual([sha("user-uuid-1")]);
  });

  it("passes fbp/fbc through raw and synthesizes fbc from fbclid when absent", () => {
    const withCookie = buildMetaEventPayload(
      purchaseInput({ fbc: "fb.1.170.abc", fbp: "fb.1.170.999" }),
      EVENT_TIME,
    )!;
    const ud1 = withCookie.user_data as Record<string, unknown>;
    expect(ud1.fbc).toBe("fb.1.170.abc");
    expect(ud1.fbp).toBe("fb.1.170.999");

    const synthesized = buildMetaEventPayload(
      purchaseInput({ fbclid: "CLICK123" }),
      EVENT_TIME,
    )!;
    const ud2 = synthesized.user_data as Record<string, unknown>;
    expect(ud2.fbc).toBe(`fb.1.${EVENT_TIME}.CLICK123`);
  });

  it("returns null when no identity signal exists at all", () => {
    expect(
      buildMetaEventPayload(purchaseInput({ email: null }), EVENT_TIME),
    ).toBeNull();
  });

  it("carries event_id, action_source and dollar value for Purchase", () => {
    const payload = buildMetaEventPayload(purchaseInput(), EVENT_TIME)!;
    expect(payload.event_name).toBe("Purchase");
    expect(payload.event_id).toBe("pi_123");
    expect(payload.action_source).toBe("website");
    expect(payload.custom_data).toMatchObject({ currency: "USD", value: 125 });
  });

  it("omits currency/value for a CompleteRegistration without a value", () => {
    const payload = buildMetaEventPayload(
      {
        eventName: "CompleteRegistration",
        eventId: "reg-1",
        brand: "aspire",
        email: "a@b.com",
        contentCategory: "registration",
      },
      EVENT_TIME,
    )!;
    expect(payload.event_name).toBe("CompleteRegistration");
    expect(payload.custom_data).toEqual({ content_category: "registration" });
  });

  it("defaults event_source_url to the SoccerOne origin for that brand", () => {
    const payload = buildMetaEventPayload(
      purchaseInput({ brand: "soccerone" }),
      EVENT_TIME,
    )!;
    expect(payload.event_source_url).toBe("https://www.gosoccerone.com/");
  });

  it("prefers an explicit eventSourceUrl over the brand default", () => {
    const payload = buildMetaEventPayload(
      purchaseInput({ eventSourceUrl: "https://aspiresportsohio.com/register/x" }),
      EVENT_TIME,
    )!;
    expect(payload.event_source_url).toBe(
      "https://aspiresportsohio.com/register/x",
    );
  });
});

describe("conversion exclusions", () => {
  const ENV_KEYS = [
    "META_CONVERSIONS_LIVE",
    "META_TEST_EVENT_CODE",
    "CONTEXT",
  ] as const;
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const k of ENV_KEYS) {
      saved[k] = process.env[k];
      delete process.env[k];
    }
  });

  afterEach(() => {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("excludes tester emails case-insensitively and the e2e test domain", () => {
    expect(isExcludedConversionEmail("mahad.ibrahim@gmail.com")).toBe(true);
    expect(isExcludedConversionEmail("Mahad.Ibrahim@Gmail.com ")).toBe(true);
    expect(isExcludedConversionEmail("alexis.santos@icloud.com")).toBe(true);
    expect(isExcludedConversionEmail("parent@test.aspiresports.com")).toBe(true);
    expect(isExcludedConversionEmail("real.customer@gmail.com")).toBe(false);
    expect(isExcludedConversionEmail(null)).toBe(false);
  });

  it("disables conversions outside production", () => {
    expect(conversionsEnabled()).toBe(false);
    process.env.CONTEXT = "deploy-preview";
    expect(conversionsEnabled()).toBe(false);
  });

  it("enables conversions on Netlify production and via explicit override", () => {
    process.env.CONTEXT = "production";
    expect(conversionsEnabled()).toBe(true);
    delete process.env.CONTEXT;
    process.env.META_CONVERSIONS_LIVE = "yes";
    expect(conversionsEnabled()).toBe(true);
  });

  it("suppresses tester conversions in live mode but allows them in Test-Events mode", () => {
    process.env.META_CONVERSIONS_LIVE = "yes";
    expect(shouldSendConversion("mahad.ibrahim@gmail.com")).toBe(false);
    expect(shouldSendConversion("real.customer@gmail.com")).toBe(true);
    process.env.META_TEST_EVENT_CODE = "TEST12345";
    expect(shouldSendConversion("mahad.ibrahim@gmail.com")).toBe(true);
  });
});
