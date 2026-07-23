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
  paymentDeadline: new Date("2026-09-03T00:00:00Z"),
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
});
