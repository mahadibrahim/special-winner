import { describe, it, expect } from "vitest";
import { composeDigestMessage } from "@/lib/ops/digest";

describe("composeDigestMessage", () => {
  it("renders signups by brand, money totals, and suppressed count", () => {
    const msg = composeDigestMessage(
      {
        signupsByBrand: { aspire: 9, soccerone: 5 },
        moneyByKind: {
          dropin_booked: { count: 12, totalCents: 18888 },
          registration_paid: { count: 2, totalCents: 17000 },
        },
        suppressed: 3,
      },
      "Thu, Jul 2",
    );
    expect(msg).toContain("Daily ops digest — Thu, Jul 2");
    expect(msg).toContain("👤 New users: 14 (Aspire 9, SoccerOne 5)");
    expect(msg).toContain("💰 Drop-in: 12 — $188.88");
    expect(msg).toContain("💰 Registration: 2 — $170.00");
    expect(msg).toContain("plus 3 pings collapsed by rate cap");
  });

  it("says quiet day when nothing happened", () => {
    const msg = composeDigestMessage(
      { signupsByBrand: {}, moneyByKind: {}, suppressed: 0 },
      "Thu, Jul 2",
    );
    expect(msg).toContain("Quiet day — no new activity.");
  });
});
