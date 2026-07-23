import { describe, it, expect } from "vitest";
import { buildTeamBackstopWarning } from "@/lib/email/send";

const base = {
  to: "captain@example.com",
  captainName: "Alex Rivera",
  teamName: "Thunder FC",
  joinUrl: "https://example.com/register/season-uuid?team=tok_abc",
  unpaidTotalCents: 45000,
  unpaidCount: 3,
  // Noon ET, unambiguously Sep 3 in America/New_York — the deadline is
  // rendered in the org timezone, not UTC (2026-09-03T00:00:00Z would be
  // Sep 2, 8pm ET, which would falsely fail the "Sep 3" assertion below).
  deadline: new Date("2026-09-03T16:00:00Z"),
};

describe("buildTeamBackstopWarning", () => {
  it("names the total, unpaid count, deadline, and join link", () => {
    const { subject, html, text } = buildTeamBackstopWarning(base);
    expect(subject).toBe(
      "Heads up: $450 in unpaid shares for Thunder FC",
    );
    for (const body of [html, text]) {
      expect(body).toContain("$450");
      expect(body).toContain("3");
      expect(body).toContain("Sep 3");
      expect(body).toContain(base.joinUrl);
    }
  });

  it("degrades when the deadline is unknown", () => {
    const { html, text } = buildTeamBackstopWarning({
      ...base,
      deadline: null,
    });
    for (const body of [html, text]) {
      expect(body).toContain("the payment deadline");
      expect(body).not.toContain("null");
      expect(body).not.toContain("NaN");
    }
  });
});
