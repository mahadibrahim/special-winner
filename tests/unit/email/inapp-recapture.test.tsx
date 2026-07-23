import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { InappRecaptureEmail } from "@/lib/email/templates/inapp-recapture";

describe("InappRecaptureEmail", () => {
  it("renders the season name, register link, and phone-browser nudge", async () => {
    const { html, text } = await renderEmail(
      <InappRecaptureEmail
        seasonName="Fall 2026 - Youth Soccer"
        registerUrl="https://www.aspiresportsohio.com/register/season-123?mode=individual&utm_source=inapp_recapture"
      />,
    );
    expect(html).toContain("Fall 2026 - Youth Soccer");
    expect(html).toContain("/register/season-123?mode=individual&amp;utm_source=inapp_recapture");
    expect(html).toContain("Finish signing up");
    expect(html).toContain(
      "Open this on your phone&#x27;s browser — Apple Pay and autofill work there.",
    );
    expect(text).toContain("Fall 2026 - Youth Soccer");
    expect(text).toContain("Finish signing up");
  });
});
