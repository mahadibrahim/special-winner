import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { EmailLayout, P, StatusPill } from "@/lib/email/components/email-layout";
import { StatusBanner } from "@/lib/email/components/status-banner";

describe("EmailLayout brand rendering", () => {
  it("renders the Aspire image logo and cream palette by default", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <P>hello</P>
      </EmailLayout>,
    );
    expect(html).toContain("/images/logo-black.png");
    expect(html).toContain("#F5EFE3");
    expect(html).toContain("Aspire Sports Ohio");
  });

  it("renders the SoccerOne wordmark and dark palette for brand=soccerone", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test" brand="soccerone">
        <P>hello</P>
      </EmailLayout>,
    );
    expect(html).not.toContain("/images/logo-black.png");
    expect(html).toContain("SOCCER");
    expect(html).toContain("#0a0a0d");
    expect(html).toContain("#a3e635");
    expect(html).toContain("SoccerOne");
  });

  it("StatusPill + StatusBanner use SoccerOne-legible status tokens under brand=soccerone", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test" brand="soccerone">
        <StatusBanner mood="warning">Payment pending</StatusBanner>
        <StatusPill variant="denied">Denied</StatusPill>
      </EmailLayout>,
    );
    // SoccerOne legible colors must appear
    expect(html).toContain("#fbbf24"); // warningFg
    expect(html).toContain("#f87171"); // deniedFg
    // Cream-era hardcoded colors must NOT appear
    expect(html).not.toContain("#8A6A2E"); // Aspire warningFg
    expect(html).not.toContain("#F4D8D2"); // Aspire deniedBg
  });

  it("StatusPill + StatusBanner use Aspire status tokens under default brand", async () => {
    const { html } = await renderEmail(
      <EmailLayout preview="test">
        <StatusBanner mood="warning">Payment pending</StatusBanner>
        <StatusPill variant="denied">Denied</StatusPill>
      </EmailLayout>,
    );
    // Aspire cream-era colors must appear
    expect(html).toContain("#8A6A2E"); // warningFg
    expect(html).toContain("#F4D8D2"); // deniedBg
  });
});
