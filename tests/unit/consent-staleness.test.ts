import { describe, it, expect } from "vitest";
import { isConsentStale, CONSENT_STALE_AFTER_DAYS } from "@/lib/consents/marketing";

const DAY = 86_400_000;

describe("parked consent goes stale", () => {
  const now = new Date("2026-10-14T12:00:00Z");

  it("a fresh consent is usable", () => {
    expect(isConsentStale(new Date(now.getTime() - 10 * DAY), now)).toBe(false);
  });

  it("a consent older than 90 days must be re-confirmed, not blasted", () => {
    // Ticked at a kiosk in July, channel goes live in October. Messaging them
    // silently three months later is how a WABA gets flagged.
    expect(isConsentStale(new Date(now.getTime() - 91 * DAY), now)).toBe(true);
  });

  it("the boundary is inclusive of the 90th day", () => {
    expect(isConsentStale(new Date(now.getTime() - CONSENT_STALE_AFTER_DAYS * DAY), now)).toBe(
      false,
    );
  });
});
