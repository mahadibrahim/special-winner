// One source of truth for the waiver assent sentence (#398): WaiverCard
// renders it, the self-serve waiver endpoint persists it. These pin the
// exact words so a copy edit is a deliberate, test-visible act — the stored
// legal record must keep matching what the screen said.
import { describe, it, expect } from "vitest";
import {
  waiverConsentVariant,
  waiverAssentSentence,
} from "@/lib/consents/waiver-consent-language";

describe("waiverConsentVariant", () => {
  it("guardian iff signing for a minor", () => {
    expect(waiverConsentVariant(true)).toBe("guardian");
    expect(waiverConsentVariant(false)).toBe("adult");
  });
});

describe("waiverAssentSentence", () => {
  it("adult sentence, exact words", () => {
    expect(waiverAssentSentence("adult")).toBe("I have read and accept these terms.");
  });

  it("guardian sentence names the minor, exact words", () => {
    expect(waiverAssentSentence("guardian", "Sam Fields")).toBe(
      "I am the parent or legal guardian of Sam Fields and accept these terms on their behalf.",
    );
  });

  it("guardian sentence without a resolvable name still reads as a sentence", () => {
    expect(waiverAssentSentence("guardian")).toBe(
      "I am the parent or legal guardian of the player and accept these terms on their behalf.",
    );
  });
});
