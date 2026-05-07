import { describe, it, expect } from "vitest";
import { renderOverdueAlert } from "@/lib/activity-tracking/messages/overdue-alert";
import type { RenderContext } from "@/lib/activity-tracking/messages/types";

const ctx: RenderContext = {
  activity: { id: "act.x", name: "Test Activity", description: "x" },
  // 30 minutes ago
  completion: { id: "c1", expectedAt: new Date(Date.now() - 30 * 60 * 1000) },
  game: { id: "g1", scheduledAt: new Date() },
  venue: { id: "v1", name: "Test Venue", timezone: "America/New_York" },
  recipient: { id: "u1", email: "test@t.com" },
  publicAppUrl: "https://app.example.com",
};

describe("renderOverdueAlert", () => {
  it("computes minutes-late and includes in SMS body", () => {
    const v = renderOverdueAlert(ctx);
    expect(v.sms.body).toContain("30m");
    expect(v.sms.body).toContain("Test Activity");
    expect(v.sms.body).toContain("Test Venue");
  });

  it("email subject includes venue + minutes-late", () => {
    const v = renderOverdueAlert(ctx);
    expect(v.email.subject).toContain("Test Venue");
    expect(v.email.subject).toContain("30m overdue");
  });

  it("telegram body includes link to completion", () => {
    const v = renderOverdueAlert(ctx);
    expect(v.telegram.body).toContain("/admin/activity-completions/c1");
    expect(v.telegram.parse_mode).toBe("HTML");
  });
});
