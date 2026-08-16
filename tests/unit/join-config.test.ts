import { describe, it, expect } from "vitest";
import {
  isConfiguredLink,
  joinContentFor,
  JOIN_WHATSAPP_URL,
} from "@/lib/branding/join-config";

describe("isConfiguredLink", () => {
  it("rejects placeholder URLs", () => {
    // The bug this guards: placeholders are syntactically valid URLs, so a
    // Boolean() check rendered them as live buttons on /join.
    expect(isConfiguredLink("https://instagram.com/REPLACE_ME")).toBe(false);
    expect(isConfiguredLink("https://chat.whatsapp.com/REPLACE_ME")).toBe(false);
  });

  it("rejects empty and missing values", () => {
    expect(isConfiguredLink("")).toBe(false);
    expect(isConfiguredLink(undefined)).toBe(false);
    expect(isConfiguredLink(null)).toBe(false);
  });

  it("accepts a real profile URL", () => {
    expect(isConfiguredLink("https://www.instagram.com/aspiresportsohio")).toBe(true);
  });
});

describe("join social config", () => {
  it("ships no placeholder social links for any brand", () => {
    for (const brand of ["aspire", "soccerone"] as const) {
      for (const [key, url] of Object.entries(joinContentFor(brand).socials)) {
        expect(url, `${brand}.${key} is still a placeholder`).not.toContain(
          "REPLACE_ME",
        );
      }
    }
  });

  it("exposes the confirmed Aspire profiles and omits accounts that do not exist", () => {
    const { socials } = joinContentFor("aspire");
    expect(socials.instagram).toBe("https://www.instagram.com/aspiresportsohio");
    expect(socials.facebook).toBe("https://www.facebook.com/aspiresportsohio");
    // No TikTok account exists and the YouTube channel is not created yet —
    // absent rather than stubbed, so no dead button renders.
    expect(socials.tiktok).toBeUndefined();
    expect(socials.youtube).toBeUndefined();
  });

  it("keeps the WhatsApp group link gated while it is a placeholder", () => {
    // Not yet created (needs a personal account — an API-registered number
    // cannot admin a consumer group). The guard is what keeps /join honest
    // until it exists; delete this expectation when the real invite lands.
    expect(isConfiguredLink(JOIN_WHATSAPP_URL)).toBe(false);
  });

  it("uses count-agnostic copy so hidden channels cannot contradict it", () => {
    for (const brand of ["aspire", "soccerone"] as const) {
      const { headline, subcopy } = joinContentFor(brand);
      expect(`${headline} ${subcopy}`).not.toMatch(/\bthree\b/i);
    }
  });
});
