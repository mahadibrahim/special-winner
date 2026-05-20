import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { EmailVerificationEmail } from "@/lib/email/templates/email-verification";

describe("renderEmail", () => {
  it("produces both an HTML and a non-empty plain-text part", async () => {
    const { html, text } = await renderEmail(
      EmailVerificationEmail({
        name: "Sarah",
        verifyUrl: "https://aspiresportsohio.com/verify-email/abc",
        expiresIn: "24 hours",
      }),
    );
    expect(html).toContain("<");
    expect(text.length).toBeGreaterThan(20);
    expect(text).not.toContain("<div");
    expect(text).toContain("Sarah");
  });
});
