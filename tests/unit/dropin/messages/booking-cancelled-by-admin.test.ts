import { describe, it, expect } from "vitest";
import { renderBookingCancelledByAdmin } from "@/lib/dropin/messages/booking-cancelled-by-admin";
import type { BookingCancelledByAdminContext } from "@/lib/dropin/messages/types";

const baseCtx: BookingCancelledByAdminContext = {
  recipient: { id: "u1", email: "u1@example.com", firstName: "Jordan" },
  session: {
    id: "s1",
    sportOrClassLabel: "soccer",
    formatLabel: null,
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
    teamAssignment: null,
  },
  reason: "session_cancelled",
  refunded: true,
};

describe("renderBookingCancelledByAdmin", () => {
  it("uses session-cancelled subject + apology copy when reason is session_cancelled", async () => {
    const v = await renderBookingCancelledByAdmin(baseCtx);
    expect(v.email.subject).toContain("Session cancelled");
    expect(v.email.html).toContain("Sorry for the disruption");
    expect(v.email.html).toContain("https://aspire.test/dropin/s1");
  });

  it("uses booking-cancelled subject when reason is admin_refund", async () => {
    const v = await renderBookingCancelledByAdmin({
      ...baseCtx,
      reason: "admin_refund",
    });
    expect(v.email.subject).toContain("Booking cancelled");
    expect(v.email.html).not.toContain("Sorry for the disruption");
  });

  it("notes the refund amount when refunded is true and amount > 0", async () => {
    const v = await renderBookingCancelledByAdmin(baseCtx);
    expect(v.email.text).toContain("$15.00");
    expect(v.sms.body).toContain("$15.00");
    expect(v.telegram.body).toContain("$15.00");
  });

  it("notes 'no charge' when amountPaidCents is 0", async () => {
    const v = await renderBookingCancelledByAdmin({
      ...baseCtx,
      booking: { ...baseCtx.booking, amountPaidCents: 0 },
      refunded: false,
    });
    expect(v.email.text).toContain("No charge");
  });

  it("renders SoccerOne dark palette with brand=soccerone", async () => {
    const v = await renderBookingCancelledByAdmin({
      ...baseCtx,
      brand: "soccerone",
    });
    expect(v.email.html).toContain("#0a0a0d");
    expect(v.email.html).not.toContain("#F5EFE3");
  });

  it("renders Aspire cream palette with brand=aspire", async () => {
    const v = await renderBookingCancelledByAdmin({
      ...baseCtx,
      brand: "aspire",
    });
    expect(v.email.html).toContain("#F5EFE3");
    expect(v.email.html).not.toContain("#0a0a0d");
  });
});
