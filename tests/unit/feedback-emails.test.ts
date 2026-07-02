// tests/unit/feedback-emails.test.ts
import { describe, it, expect } from "vitest";
import { renderEmail } from "@/lib/email/render";
import { FeedbackNpsEmail } from "@/lib/email/templates/feedback-nps";
import { FeedbackDetractorAlertEmail } from "@/lib/email/templates/feedback-detractor-alert";
import { FeedbackRefereeRatingEmail } from "@/lib/email/templates/feedback-referee-rating";

describe("feedback email templates", () => {
  it("renders the NPS survey email with the tokenized link", async () => {
    const { html, text } = await renderEmail(
      FeedbackNpsEmail({
        recipientName: "Jordan",
        eventLabel: "Pickup Soccer — Mon, Jun 29",
        surveyUrl: "https://example.com/feedback/tok123",
        brand: "aspire",
      }),
    );
    expect(html).toContain("https://example.com/feedback/tok123");
    expect(html).toContain("Pickup Soccer");
    expect(text).toContain("https://example.com/feedback/tok123");
  });

  it("renders the detractor alert with score and comment", async () => {
    const { html } = await renderEmail(
      FeedbackDetractorAlertEmail({
        score: 3,
        comment: "Fields were muddy",
        eventLabel: "Pickup Soccer — Mon, Jun 29",
        kind: "nps_drop_in",
        brand: "aspire",
      }),
    );
    expect(html).toContain("3");
    expect(html).toContain("Fields were muddy");
  });

  it("renders the referee rating email", async () => {
    const { html } = await renderEmail(
      FeedbackRefereeRatingEmail({
        recipientName: "Jordan",
        eventLabel: "U10 Tigers vs U10 Lions — Sat, Jul 4",
        refereeName: "Alex R.",
        surveyUrl: "https://example.com/feedback/tok456",
        brand: "aspire",
      }),
    );
    expect(html).toContain("Alex R.");
    expect(html).toContain("https://example.com/feedback/tok456");
  });
});
