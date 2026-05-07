import { describe, it, expect } from "vitest";
import { renderPreReminder } from "@/lib/activity-tracking/messages/pre-reminder";
import type { RenderContext } from "@/lib/activity-tracking/messages/types";

const ctx: RenderContext = {
  activity: { id: "act.x", name: "Field Walkthrough", description: "Inspect lines + nets" },
  // 10 minutes from now
  completion: { id: "c1", expectedAt: new Date(Date.now() + 10 * 60 * 1000) },
  game: { id: "g1", scheduledAt: new Date() },
  venue: { id: "v1", name: "Powell Field", timezone: "America/New_York" },
  recipient: { id: "u1", email: "test@t.com" },
  publicAppUrl: "https://app.example.com",
};

describe("renderPreReminder", () => {
  it("SMS body announces upcoming due time", () => {
    const v = renderPreReminder(ctx);
    expect(v.sms.body).toContain("due in");
    expect(v.sms.body).toContain("Field Walkthrough");
    expect(v.sms.body).toContain("Powell Field");
    expect(v.sms.body).toContain("/admin/activity-completions/c1");
  });

  it("email subject includes venue + activity", () => {
    const v = renderPreReminder(ctx);
    expect(v.email.subject).toContain("Powell Field");
    expect(v.email.subject).toContain("Field Walkthrough");
    expect(v.email.subject).toContain("due in");
  });

  it("telegram body uses HTML parse_mode and includes link", () => {
    const v = renderPreReminder(ctx);
    expect(v.telegram.parse_mode).toBe("HTML");
    expect(v.telegram.body).toContain("<b>");
    expect(v.telegram.body).toContain("/admin/activity-completions/c1");
  });
});
