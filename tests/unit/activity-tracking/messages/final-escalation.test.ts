import { describe, it, expect } from "vitest";
import { renderFinalEscalation } from "@/lib/activity-tracking/messages/final-escalation";
import type { RenderContext } from "@/lib/activity-tracking/messages/types";

const ctx: RenderContext = {
  activity: { id: "act.x", name: "Locker Lock-Up", description: "Final secure" },
  completion: { id: "c1", expectedAt: new Date(Date.now() - 130 * 60 * 1000) },
  game: { id: "g1", scheduledAt: new Date() },
  venue: { id: "v1", name: "Worthington", timezone: "America/New_York" },
  recipient: { id: "u1", email: "test@t.com" },
  publicAppUrl: "https://app.example.com",
};

describe("renderFinalEscalation", () => {
  it("SMS body says director notified — please intervene", () => {
    const v = renderFinalEscalation(ctx);
    expect(v.sms.body).toContain("DIRECTOR NOTIFIED");
    expect(v.sms.body).toContain("intervene");
  });

  it("email subject flags director notification", () => {
    const v = renderFinalEscalation(ctx);
    expect(v.email.subject).toContain("DIRECTOR NOTIFIED");
    expect(v.email.subject).toContain("Locker Lock-Up");
  });

  it("telegram body includes intervene callout + link", () => {
    const v = renderFinalEscalation(ctx);
    expect(v.telegram.body).toContain("intervene");
    expect(v.telegram.body).toContain("/admin/activity-completions/c1");
  });
});
