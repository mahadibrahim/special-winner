import { describe, it, expect } from "vitest";
import { registerHref } from "@/components/leagues/divisions-finder";

const base = { seasonId: "s1", level: "d", gender: "mens", venueSlug: "worthington", signupModes: ["team", "individual"] };

describe("registerHref", () => {
  it("open team-capable division → canonical /register/{id}", () => {
    expect(registerHref({ ...base, status: "open" } as any)).toBe("/register/s1");
  });
  it("open individual-only division → canonical /register/{id}", () => {
    expect(registerHref({ ...base, signupModes: ["individual"], status: "open" } as any)).toBe("/register/s1");
  });
  it("completed division → null (archive row — a register link over a finished season is a dead button)", () => {
    expect(registerHref({ ...base, status: "completed" } as any)).toBeNull();
  });
  it("forming division → null (renders an inline InterestCapture, not a link)", () => {
    // Contract change 2026-07-16: this used to return
    // /api/public/season-interest?seasonId=s1 as an <a href> — a GET against a
    // POST-only endpoint, so every "Notify me" click 405'd. Forming divisions
    // now capture in place; there is no navigation target.
    expect(registerHref({ ...base, status: "forming" } as any)).toBeNull();
  });
});
