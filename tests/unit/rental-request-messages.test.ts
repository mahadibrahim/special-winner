import { describe, it, expect } from "vitest";
import { renderRentalRequestMessage } from "@/lib/rentals/messages/request-lifecycle";

const base = {
  recipientName: "Jordan",
  venueName: "Worthington",
  startsAt: new Date("2026-09-01T22:00:00.000Z"),
  endsAt: new Date("2026-09-01T23:00:00.000Z"),
  timezone: "America/New_York",
  amountDueCents: 5000,
  payUrl: "https://example.com/dashboard/bookings",
  brand: "soccerone" as const,
};

describe("renderRentalRequestMessage", () => {
  it("received: no pay link, mentions review", async () => {
    const m = await renderRentalRequestMessage("received", { ...base, payUrl: null });
    expect(m.email.subject).toMatch(/request received/i);
    expect(m.sms.body).toMatch(/SoccerOne/);
    expect(m.email.html).not.toMatch(/Pay &amp; confirm/);
  });

  it("approved: includes pay link + 24h", async () => {
    const m = await renderRentalRequestMessage("approved", base);
    expect(m.email.subject).toMatch(/approved/i);
    expect(m.email.html).toMatch(/dashboard\/bookings/);
    expect(m.sms.body).toMatch(/24h/);
  });

  it("declined: no pay link", async () => {
    const m = await renderRentalRequestMessage("declined", { ...base, payUrl: null });
    expect(m.email.subject).toMatch(/update/i);
    expect(m.sms.body).toMatch(/couldn't/i);
  });
});
