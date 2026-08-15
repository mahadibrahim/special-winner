import { describe, expect, it } from "vitest";
import { resolveGoogleReviewUrl } from "@/lib/feedback/review-url";
import type { OrganizationSettings } from "@/lib/db/schema";

const VENUE_A = "11111111-1111-1111-1111-111111111111";
const VENUE_B = "22222222-2222-2222-2222-222222222222";

const settings: Pick<OrganizationSettings, "feedback"> = {
  feedback: {
    googleReviewUrl: {
      aspire: "https://g.page/r/aspire-brand/review",
      soccerone: "https://g.page/r/soccerone-brand/review",
    },
    googleReviewUrlByVenue: {
      [VENUE_A]: "https://g.page/r/venue-a/review",
    },
  },
};

describe("resolveGoogleReviewUrl", () => {
  it("prefers the venue-specific listing over the brand fallback", () => {
    expect(resolveGoogleReviewUrl(settings, "aspire", VENUE_A)).toBe(
      "https://g.page/r/venue-a/review",
    );
  });

  it("falls back to the brand URL when the venue has no override", () => {
    expect(resolveGoogleReviewUrl(settings, "aspire", VENUE_B)).toBe(
      "https://g.page/r/aspire-brand/review",
    );
  });

  it("falls back to the brand URL when no venue is known", () => {
    expect(resolveGoogleReviewUrl(settings, "aspire", null)).toBe(
      "https://g.page/r/aspire-brand/review",
    );
    expect(resolveGoogleReviewUrl(settings, "aspire", undefined)).toBe(
      "https://g.page/r/aspire-brand/review",
    );
  });

  it("resolves per-brand — soccerone gets the soccerone listing", () => {
    expect(resolveGoogleReviewUrl(settings, "soccerone", VENUE_B)).toBe(
      "https://g.page/r/soccerone-brand/review",
    );
  });

  it("venue override wins regardless of brand", () => {
    // Venue listings are physical-facility Google profiles, shared across
    // brands — the same precedence score.ts always applied.
    expect(resolveGoogleReviewUrl(settings, "soccerone", VENUE_A)).toBe(
      "https://g.page/r/venue-a/review",
    );
  });

  it("returns null when the brand has no URL configured", () => {
    const aspireOnly: Pick<OrganizationSettings, "feedback"> = {
      feedback: { googleReviewUrl: { aspire: "https://g.page/r/aspire-brand/review" } },
    };
    expect(resolveGoogleReviewUrl(aspireOnly, "soccerone", null)).toBeNull();
  });

  it("returns null when feedback settings are absent entirely", () => {
    expect(resolveGoogleReviewUrl({}, "aspire", VENUE_A)).toBeNull();
    expect(resolveGoogleReviewUrl(null, "aspire", VENUE_A)).toBeNull();
    expect(resolveGoogleReviewUrl(undefined, "aspire", null)).toBeNull();
  });
});
