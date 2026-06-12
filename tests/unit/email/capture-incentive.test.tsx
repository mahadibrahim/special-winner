import React from "react";
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { CaptureIncentiveEmail } from "@/lib/email/templates/capture-incentive";

describe("CaptureIncentiveEmail", () => {
  it("renders the code, amount, and programs link in html and text", async () => {
    const { html, text } = await renderEmail(
      <CaptureIncentiveEmail
        amount="$15"
        code="WELCOME15"
        programsUrl="https://www.aspiresportsohio.com/programs"
      />,
    );
    expect(html).toContain("WELCOME15");
    expect(html).toContain("$15");
    expect(html).toContain("https://www.aspiresportsohio.com/programs");
    expect(text).toContain("WELCOME15");
    expect(text).toContain("$15");
  });
});
