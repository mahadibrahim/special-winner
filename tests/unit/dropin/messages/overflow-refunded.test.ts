import { describe, it, expect } from "vitest";
import { renderOverflowRefunded } from "@/lib/dropin/messages/overflow-refunded";
import type { OverflowRefundedContext } from "@/lib/dropin/messages/types";

const ctx: OverflowRefundedContext = {
  recipient: { id: "u1", email: "u1@example.com", firstName: "Alex" },
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
};

describe("renderOverflowRefunded", () => {
  it("tells the customer they were refunded and are first in line — not a normal confirmation", async () => {
    const v = await renderOverflowRefunded(ctx);
    expect(v.sms.body).toMatch(/filled up/i);
    expect(v.sms.body).toMatch(/first in line/i);
    expect(v.sms.body).toContain("$15.00");
    expect(v.email.subject).toMatch(/filled up/i);
    expect(v.email.html).toMatch(/first on the waitlist/i);
    expect(v.telegram.parse_mode).toBe("HTML");
  });

  it("quotes the real refund amount from the booking, not a placeholder", async () => {
    const v = await renderOverflowRefunded({
      ...ctx,
      booking: { ...ctx.booking, amountPaidCents: 3499 },
    });
    expect(v.sms.body).toContain("$34.99");
    expect(v.email.html).toContain("$34.99");
  });

  it("does not surface the raw booking id — natural language only", async () => {
    const v = await renderOverflowRefunded(ctx);
    expect(v.sms.body).not.toContain(ctx.booking.id);
    expect(v.email.html).not.toContain(ctx.booking.id);
    expect(v.telegram.body).not.toContain(ctx.booking.id);
  });

  it("renders SoccerOne dark palette with brand=soccerone", async () => {
    const v = await renderOverflowRefunded({ ...ctx, brand: "soccerone" });
    expect(v.email.html).toContain("#0a0a0d");
    expect(v.email.html).not.toContain("#F5EFE3");
  });

  it("renders Aspire cream palette with brand=aspire", async () => {
    const v = await renderOverflowRefunded({ ...ctx, brand: "aspire" });
    expect(v.email.html).toContain("#F5EFE3");
    expect(v.email.html).not.toContain("#0a0a0d");
  });
});
