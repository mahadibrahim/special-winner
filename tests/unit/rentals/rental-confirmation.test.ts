/**
 * Renderer test for the field-rental confirmation message.
 *
 * Imports the email render stack (@react-email → html-to-text), so it runs on
 * CI; under the local Node 25 / htmlparser2 ESM-resolution issue the email
 * stack can't be imported. The pure window formatter is covered separately in
 * rental-window.test.ts (no email deps), which runs locally.
 */
import { describe, it, expect } from "vitest";
import { renderRentalConfirmation } from "@/lib/rentals/messages/rental-confirmation";

const baseCtx = {
  recipientName: "Sam Renter",
  venueName: "Downtown Arena",
  fieldNumber: 3,
  startsAt: new Date("2026-06-20T22:00:00.000Z"),
  endsAt: new Date("2026-06-20T23:30:00.000Z"),
  timezone: "America/New_York",
  amountPaidCents: 8000,
};

describe("renderRentalConfirmation", () => {
  it("produces an email whose subject and body carry the rental details", async () => {
    const v = await renderRentalConfirmation(baseCtx);
    expect(v.email.subject.toLowerCase()).toContain("confirmed");
    expect(v.email.subject).toContain("Downtown Arena");
    expect(v.email.html).toContain("Downtown Arena");
    expect(v.email.html).toContain("Field 3");
    expect(v.email.html).toContain("$80.00");
    expect(v.email.text.length).toBeGreaterThan(0);
  });

  it("produces an SMS body with venue, field, and amount", async () => {
    const v = await renderRentalConfirmation(baseCtx);
    expect(v.sms.body).toContain("Downtown Arena");
    expect(v.sms.body).toContain("Field 3");
    expect(v.sms.body).toContain("$80.00");
  });

  it("labels a $0 (comp) rental without a dollar amount", async () => {
    const v = await renderRentalConfirmation({ ...baseCtx, amountPaidCents: 0 });
    expect(v.email.html).not.toContain("$0.00");
    expect(v.sms.body).not.toContain("$0.00");
  });
});
