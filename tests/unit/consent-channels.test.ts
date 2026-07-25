import { describe, it, expect } from "vitest";
import { CONSENT_COPY, CONSENT_CHANNELS } from "@/lib/consents/marketing-channels";

describe("consent copy", () => {
  it("has copy for every channel", () => {
    for (const c of CONSENT_CHANNELS) {
      expect(CONSENT_COPY[c], `missing copy for ${c}`).toBeTruthy();
    }
  });

  it("never phrases an opt-in as a condition of entry", () => {
    // The waiver is a condition of entry. Consent obtained as a condition of
    // something else is not consent — and a carrier reviewer reads this copy.
    for (const c of CONSENT_CHANNELS) {
      expect(CONSENT_COPY[c].toLowerCase()).not.toMatch(/required|must|to enter/);
    }
  });
});
