import React from "react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { CompletionForm } from "@/components/registration/completion-form";

// The post-payment completion form is now the ONLY place a youth waiver gets
// signed (youth adopted the v2 flow: no pre-payment agreements step). The
// shared WaiverText body is participant-agnostic, so this attestation line is
// what makes a guardian's signature a guardian's signature. Mirrors
// tests/unit/waiver-card-consent.test.tsx, which guards the same sentence on
// the self-serve waiver.
const GUARDIAN_PHRASE = "and accept these terms on their behalf.";

const render = (props: { isSelf: boolean; participantName?: string }) =>
  renderToStaticMarkup(
    <CompletionForm
      registrationId="11111111-1111-4111-8111-111111111111"
      seasonId="22222222-2222-4222-8222-222222222222"
      needsBirthDate={false}
      via="confirm_screen"
      {...props}
    />,
  );

describe("CompletionForm guardian attestation (dependent registrant)", () => {
  it("isSelf=false renders the guardian sentence with the participant name interpolated", () => {
    const html = render({ isSelf: false, participantName: "Distinctive Kiddo Zephyrine" });
    expect(html).toContain(
      "I am the parent or legal guardian of Distinctive Kiddo Zephyrine and accept these terms on their behalf.",
    );
  });

  it('isSelf=false labels the signature "Parent/guardian signature"', () => {
    const html = render({ isSelf: false, participantName: "Kiddo Tester" });
    expect(html).toContain("Parent/guardian signature");
    expect(html).not.toContain("Digital Signature");
  });

  it("isSelf=false keeps the shared checkbox label and signature placeholder", () => {
    const html = render({ isSelf: false, participantName: "Kiddo Tester" });
    expect(html).toContain("I agree to the terms above.");
    expect(html).toContain("Type your full legal name");
  });

  it("isSelf=false falls back to generic phrasing when no name is threaded", () => {
    const html = render({ isSelf: false });
    expect(html).toContain(
      "I am the parent or legal guardian of this player and accept these terms on their behalf.",
    );
  });

  it("isSelf=true renders NO guardian language and keeps the adult signature label", () => {
    const html = render({ isSelf: true, participantName: "Sam Adult" });
    expect(html).not.toContain("parent or legal guardian");
    expect(html).not.toContain(GUARDIAN_PHRASE);
    expect(html).not.toContain("Parent/guardian signature");
    expect(html).toContain("Digital Signature");
  });

  // REGRESSION GUARD (same incident rule as WaiverCard.tsx:26-35): the
  // guardian-vs-adult branch must come from the server-threaded `isSelf`
  // prop, never from comparing the signer's name to the participant's. A
  // parent who shares their child's exact name (Jr./Sr.) would compare equal
  // and silently lose the guardian attestation.
  it("isSelf=false STILL renders guardian language when the names would compare equal", () => {
    const namesake = "Chris Miller Jr.";
    const html = render({ isSelf: false, participantName: namesake });
    expect(html).toContain(
      `I am the parent or legal guardian of ${namesake} and accept these terms on their behalf.`,
    );
    expect(html).toContain("Parent/guardian signature");
  });
});
