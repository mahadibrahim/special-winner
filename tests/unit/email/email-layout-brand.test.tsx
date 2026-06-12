import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { EmailLayout, P } from "@/lib/email/components/email-layout";

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
});
