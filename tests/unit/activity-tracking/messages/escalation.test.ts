import { describe, it, expect } from "vitest";
import { renderEscalation } from "@/lib/activity-tracking/messages/escalation";
import type { RenderContext } from "@/lib/activity-tracking/messages/types";

const ctx: RenderContext = {
  activity: { id: "act.x", name: "Concession Open", description: "Open the concessions stand" },
  completion: { id: "c1", expectedAt: new Date(Date.now() - 60 * 60 * 1000) },
  game: { id: "g1", scheduledAt: new Date() },
  venue: { id: "v1", name: "Powell", timezone: "America/New_York" },
  recipient: { id: "u1", email: "test@t.com" },
  publicAppUrl: "https://app.example.com",
  handoffRole: "role.director",
};

describe("renderEscalation", () => {
  it("SMS announces escalation to the handoff role", () => {
    const v = renderEscalation(ctx);
    expect(v.sms.body).toContain("Escalating");
    expect(v.sms.body).toContain("role.director");
  });

  it("email subject mentions escalation", () => {
    const v = renderEscalation(ctx);
    expect(v.email.subject).toContain("Escalating");
    expect(v.email.subject).toContain("Concession Open");
  });

  it("falls back to generic phrasing when handoffRole is null", () => {
    const v = renderEscalation({ ...ctx, handoffRole: null });
    expect(v.sms.body).toContain("the next role");
  });
});
