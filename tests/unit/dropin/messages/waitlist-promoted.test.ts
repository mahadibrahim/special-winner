import { describe, it, expect } from "vitest";
import { renderWaitlistPromoted } from "@/lib/dropin/messages/waitlist-promoted";
import type { WaitlistPromotedContext } from "@/lib/dropin/messages/types";

const futureExpiry = new Date(Date.now() + 30 * 60_000);

const ctx: WaitlistPromotedContext = {
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
    amountPaidCents: 0,
    paymentMethod: "card_online",
    teamAssignment: null,
  },
  promotionToken: "tok-abc-123",
  promotionExpiresAt: futureExpiry,
};

describe("renderWaitlistPromoted", () => {
  it("emits all three channels with a claim link containing the token", async () => {
    const v = await renderWaitlistPromoted(ctx);
    const expectedLink = "https://aspire.test/dropin/claim/tok-abc-123";
    expect(v.email.html).toContain(expectedLink);
    expect(v.email.text).toContain(expectedLink);
    expect(v.sms.body).toContain(expectedLink);
    expect(v.telegram.body).toContain(expectedLink);
    expect(v.telegram.parse_mode).toBe("HTML");
  });

  it("includes a countdown to the promotion expiry", async () => {
    const v = await renderWaitlistPromoted(ctx);
    expect(v.email.subject).toMatch(/A spot opened up/);
    expect(v.email.subject).toMatch(/\d+ min/);
    expect(v.sms.body).toMatch(/\d+ min/);
  });

  it("addresses the recipient by first name when present", async () => {
    const v = await renderWaitlistPromoted(ctx);
    expect(v.email.html).toContain("Alex");
    expect(v.email.text).toContain("Alex");
  });
});
