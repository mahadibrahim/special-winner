import { describe, it, expect } from "vitest";
import { buildTeamDepositReceipt } from "@/lib/email/send";

const base = {
  to: "captain@example.com",
  captainName: "Alex Rivera",
  teamName: "Thunder FC",
  seasonName: "Fall 2026 — Co-Ed C",
  seasonId: "season-uuid",
  inviteToken: "tok_abc",
  teamFeeCents: 100000,
  depositCents: 20000,
  // Noon ET, unambiguously Sep 3 in America/New_York — the deadline is
  // rendered in the org timezone, not UTC (2026-09-03T00:00:00Z would be
  // Sep 2, 8pm ET, which would falsely fail the "Sep 3" assertion below).
  paymentDeadline: new Date("2026-09-03T16:00:00Z"),
};

describe("buildTeamDepositReceipt", () => {
  it("names the deposit, total, remainder, deadline, and join link", () => {
    const { subject, html, text, joinUrl } = buildTeamDepositReceipt(base);
    expect(subject).toBe("Thunder FC is reserved — here's your team link");
    expect(joinUrl).toContain("/register/season-uuid?team=tok_abc");
    for (const body of [html, text]) {
      expect(body).toContain("$200");
      expect(body).toContain("$1,000");
      expect(body).toContain("$800"); // remainder the roster covers
      expect(body).toContain("Sep 3"); // backstop deadline
      expect(body).toContain(joinUrl);
    }
  });
  it("degrades when fee/deadline are unknown", () => {
    const { html, text } = buildTeamDepositReceipt({
      ...base,
      teamFeeCents: null,
      paymentDeadline: null,
    });
    for (const body of [html, text]) {
      expect(body).toContain("$200");
      expect(body).not.toContain("null");
      expect(body).not.toContain("NaN");
      expect(body).toContain("the payment deadline"); // generic fallback wording
    }
  });

  // winter-team-fixes, task 4: a youth captain's deposit is a refundable
  // hold, never a per-share credit — the copy must say "refunded", never
  // "counts toward"/"remaining", and must name the FULL fee, not a remainder.
  describe("isYouth", () => {
    it("uses the refund-promise copy and the full fee, not a remainder", () => {
      const { html, text } = buildTeamDepositReceipt({ ...base, isYouth: true });
      for (const body of [html, text]) {
        expect(body).toContain("$200");
        expect(body).toContain("$1,000"); // full fee, not the $800 remainder
        expect(body).toContain("refunded");
        expect(body).not.toContain("$800");
        expect(body).not.toContain("counts toward");
      }
    });

    // fix round 1, minor (a): the deadline line must say "deposit absorbs
    // the shortfall first, THEN the card" — not "teammate shares are
    // charged", which contradicts teamYouthDueCents' deposit-first math.
    it("deadline line: deposit absorbs the shortfall first, remainder to the card", () => {
      const { html, text } = buildTeamDepositReceipt({ ...base, isYouth: true });
      for (const body of [html, text]) {
        expect(body).toContain("applied to the difference first");
        expect(body).toContain("charged to your card on file");
        expect(body).not.toContain("Teammate shares still unpaid");
      }
    });

    it("adult deadline line is unchanged", () => {
      const { html } = buildTeamDepositReceipt(base);
      expect(html).toContain("Teammate shares still unpaid");
    });

    it("degrades to generic full-fee refund wording when the fee is unknown", () => {
      const { html, text } = buildTeamDepositReceipt({
        ...base,
        isYouth: true,
        teamFeeCents: null,
      });
      for (const body of [html, text]) {
        expect(body).toContain("$200");
        expect(body).toContain("refunded");
        expect(body).not.toContain("null");
        expect(body).not.toContain("NaN");
      }
    });

    it("defaults to the adult (credit-toward) copy when isYouth is omitted", () => {
      const { html } = buildTeamDepositReceipt(base);
      expect(html).toContain("counts toward");
      expect(html).not.toContain("refunded");
    });
  });
});
