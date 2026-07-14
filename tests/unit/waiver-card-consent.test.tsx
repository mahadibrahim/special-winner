import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { WaiverCard } from "@/components/self-serve/WaiverCard";

const GUARDIAN_PHRASE = "and accept these terms on their behalf.";

describe("WaiverCard consent language (isMinor branch)", () => {
  it("isMinor=true renders the guardian consent sentence with the player's name interpolated", () => {
    const html = renderToStaticMarkup(
      <WaiverCard
        token="tok-1"
        signerName="Jordan Guardian"
        playerName="Distinctive Kiddo Zephyrine"
        isMinor={true}
        done={false}
        onDone={() => {}}
      />,
    );
    expect(html).toContain(
      "I am the parent or legal guardian of Distinctive Kiddo Zephyrine and accept these terms on their behalf.",
    );
  });

  it('isMinor=true renders the "Parent/guardian signature" label', () => {
    const html = renderToStaticMarkup(
      <WaiverCard
        token="tok-2"
        signerName="Jordan Guardian"
        playerName="Kiddo"
        isMinor={true}
        done={false}
        onDone={() => {}}
      />,
    );
    expect(html).toContain("Parent/guardian signature");
  });

  it('isMinor=false renders the adult line "I have read and accept these terms."', () => {
    const html = renderToStaticMarkup(
      <WaiverCard
        token="tok-3"
        signerName="Sam Adult"
        playerName="Sam Adult"
        isMinor={false}
        done={false}
        onDone={() => {}}
      />,
    );
    expect(html).toContain("I have read and accept these terms.");
  });

  it("isMinor=false does NOT render any guardian/parent consent language", () => {
    const html = renderToStaticMarkup(
      <WaiverCard
        token="tok-4"
        signerName="Sam Adult"
        playerName="Sam Adult"
        isMinor={false}
        done={false}
        onDone={() => {}}
      />,
    );
    expect(html).not.toContain(GUARDIAN_PHRASE);
    expect(html).not.toContain("parent or legal guardian");
    expect(html).not.toContain("Parent/guardian signature");
  });

  // REGRESSION GUARD: the component used to derive "is this a guardian
  // signing" by string-comparing signerName vs playerName. That heuristic
  // silently broke for the Jr./Sr. namesake case — a parent who shares
  // their minor child's exact name (e.g. "Chris Miller Jr." signing for
  // "Chris Miller Jr.") would compare equal and get treated as the ADULT
  // signing for themselves, skipping guardian consent language entirely.
  // isMinor is now threaded authoritatively from resolveSigner() via
  // build-context.ts and must NEVER be re-derived from name comparison.
  // This is the single most important assertion in this file.
  it("isMinor=true STILL renders guardian consent when signerName === playerName (Jr./Sr. namesake case)", () => {
    const namesake = "Chris Miller Jr.";
    const html = renderToStaticMarkup(
      <WaiverCard
        token="tok-5"
        signerName={namesake}
        playerName={namesake}
        isMinor={true}
        done={false}
        onDone={() => {}}
      />,
    );
    expect(html).toContain(
      `I am the parent or legal guardian of ${namesake} and accept these terms on their behalf.`,
    );
    expect(html).toContain("Parent/guardian signature");
  });
});
