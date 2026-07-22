import { describe, it, expect } from "vitest";
import { registerHref } from "@/components/leagues/divisions-finder";

const base = { seasonId: "abc-123", status: "open" } as any;

describe("registerHref", () => {
  it("appends mode=individual for open divisions", () => {
    expect(registerHref({ ...base, status: "open" })).toBe(
      "/register/abc-123?mode=individual",
    );
  });
  it("keeps the interest link for forming divisions", () => {
    expect(registerHref({ ...base, status: "forming" })).toBe(
      "/api/public/season-interest?seasonId=abc-123",
    );
  });
});
