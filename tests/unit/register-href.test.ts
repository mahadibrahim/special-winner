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
  it("forming division → season-interest API", () => {
    expect(registerHref({ ...base, status: "forming" } as any)).toBe("/api/public/season-interest?seasonId=s1");
  });
});
