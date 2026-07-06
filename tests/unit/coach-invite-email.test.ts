import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { CoachInviteEmail } from "@/lib/email/templates/coach-invite";

describe("CoachInviteEmail", () => {
  it("renders the invite URL, name, and expiry into html and text", async () => {
    const { html, text } = await renderEmail(
      CoachInviteEmail({
        name: "Sam",
        inviteUrl: "https://example.com/m/tok123",
        expiresIn: "72 hours",
      }),
    );
    expect(html).toContain("https://example.com/m/tok123");
    expect(html).toContain("Sam");
    expect(html).toContain("72 hours");
    expect(text).toContain("https://example.com/m/tok123");
  });

  it("falls back gracefully with no name", async () => {
    const { html } = await renderEmail(
      CoachInviteEmail({
        name: "",
        inviteUrl: "https://example.com/m/tok456",
        expiresIn: "72 hours",
      }),
    );
    expect(html).toContain("there");
  });
});
