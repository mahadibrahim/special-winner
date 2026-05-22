import { describe, it, expect } from "vitest";
import { renderBookingConfirmation } from "@/lib/dropin/messages/booking-confirmation";
import type { BookingConfirmationContext } from "@/lib/dropin/messages/types";

const baseCtx: BookingConfirmationContext = {
  recipient: { id: "u1", email: "u1@example.com", firstName: "Sam" },
  session: {
    id: "s1",
    sportOrClassLabel: "soccer",
    formatLabel: "5v5",
    startsAt: new Date("2026-06-01T18:00:00Z"),
    endsAt: new Date("2026-06-01T19:30:00Z"),
    kind: "pickup",
  },
  venue: { id: "v1", name: "Aspire Worthington", timezone: "America/New_York" },
  publicAppUrl: "https://aspire.test",
  booking: {
    id: "b1",
    amountPaidCents: 1500,
    paymentMethod: "card_online",
    teamAssignment: "orange",
  },
  source: "online_booking",
};

describe("renderBookingConfirmation", () => {
  it("emits all three channel variants with the session detail link", async () => {
    const v = await renderBookingConfirmation(baseCtx);
    expect(v.email.subject).toContain("Booking confirmed");
    expect(v.email.subject).toContain("Aspire Worthington");
    expect(v.email.html).toContain("https://aspire.test/dropin/s1");
    expect(v.email.text).toContain("$15.00");
    expect(v.sms.body).toContain("Aspire Worthington");
    expect(v.sms.body).toContain("https://aspire.test/dropin/s1");
    expect(v.sms.body).toContain("orange");
    expect(v.telegram.body).toContain("Aspire Worthington");
    expect(v.telegram.parse_mode).toBe("HTML");
  });

  it("includes team assignment when present", async () => {
    const v = await renderBookingConfirmation(baseCtx);
    expect(v.email.html).toContain("orange");
    expect(v.telegram.body).toContain("orange");
  });

  it("uses walk-up source label when source is walk_up", async () => {
    const v = await renderBookingConfirmation({
      ...baseCtx,
      source: "walk_up",
      booking: { ...baseCtx.booking, paymentMethod: "card_present" },
    });
    expect(v.email.subject).toContain("Walk-up");
  });

  it("notes membership inclusion when amountPaidCents is 0 and not card_present", async () => {
    const v = await renderBookingConfirmation({
      ...baseCtx,
      booking: {
        ...baseCtx.booking,
        amountPaidCents: 0,
        paymentMethod: "member_unlimited",
      },
    });
    expect(v.email.text).toContain("Included");
  });
});
