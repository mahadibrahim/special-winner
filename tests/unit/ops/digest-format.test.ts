import { describe, it, expect } from "vitest";
import { composeDigestMessage, pickDigestBrand } from "@/lib/ops/digest";

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
    expect(msg).toContain("plus 3 pings not delivered instantly");
  });

  it("renders job applications as a plain count, never $0.00", () => {
    const msg = composeDigestMessage(
      {
        signupsByBrand: {},
        moneyByKind: { job_application: { count: 2, totalCents: 0 } },
        suppressed: 0,
      },
      "Thu, Jul 2",
    );
    expect(msg).toContain("📝 Job applications: 2");
    expect(msg).not.toContain("$0.00");
  });

  it("says quiet day when nothing happened", () => {
    const msg = composeDigestMessage(
      { signupsByBrand: {}, moneyByKind: {}, suppressed: 0 },
      "Thu, Jul 2",
    );
    expect(msg).toContain("Quiet day — no new activity.");
  });
});

describe("pickDigestBrand", () => {
  it("picks soccerone when it dominates the day's activity", () => {
    expect(pickDigestBrand({ soccerone: 7, aspire: 2 })).toBe("soccerone");
  });

  it("defaults to aspire on ties", () => {
    expect(pickDigestBrand({ soccerone: 4, aspire: 4 })).toBe("aspire");
  });

  it("defaults to aspire when there was no activity", () => {
    expect(pickDigestBrand({})).toBe("aspire");
  });

  it("falls back to aspire for a dominant brand with no email identity", () => {
    expect(pickDigestBrand({ futurebrand: 9, soccerone: 1 })).toBe("aspire");
  });
});
