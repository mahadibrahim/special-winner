import { describe, it, expect } from "vitest";
import { attentionActionTarget } from "@/lib/venue/attention-action";

const base = { id: "x", title: "t", subtitle: "s" } as const;

describe("attentionActionTarget", () => {
  it("prefers the session panel when a sessionId exists", () => {
    expect(attentionActionTarget({ ...base, kind: "ref", sessionId: "abc" }))
      .toEqual({ type: "session", sessionId: "abc" });
  });
  it("routes messages to the real inbox (/messages, NOT /admin/messages)", () => {
    expect(attentionActionTarget({ ...base, kind: "message" }))
      .toEqual({ type: "href", href: "/messages" });
  });
  it("routes requests to the venue-accessible refund queue", () => {
    expect(attentionActionTarget({ ...base, kind: "request" }))
      .toEqual({ type: "href", href: "/admin/refund-requests" });
  });
  it("returns null (no action) for waiver/photo/ref without a session", () => {
    expect(attentionActionTarget({ ...base, kind: "waiver" })).toBeNull();
    expect(attentionActionTarget({ ...base, kind: "photo" })).toBeNull();
    expect(attentionActionTarget({ ...base, kind: "ref" })).toBeNull();
  });
});
