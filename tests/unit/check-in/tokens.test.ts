import { describe, it, expect } from "vitest";
import { generateTokenValue, isTokenShape } from "@/lib/check-in/tokens";

describe("generateTokenValue", () => {
  it("returns a 43-character base64url string", () => {
    const t = generateTokenValue();
    expect(t.length).toBe(43);
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });
  it("produces unique values across calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1000; i++) seen.add(generateTokenValue());
    expect(seen.size).toBe(1000);
  });
});

describe("isTokenShape", () => {
  it("accepts well-formed tokens", () => {
    expect(isTokenShape(generateTokenValue())).toBe(true);
  });
  it("rejects strings with disallowed characters", () => {
    expect(isTokenShape("has spaces and stuff!")).toBe(false);
  });
  it("rejects too-short and too-long values", () => {
    expect(isTokenShape("short")).toBe(false);
    expect(isTokenShape("x".repeat(100))).toBe(false);
  });
  it("rejects empty input", () => {
    expect(isTokenShape("")).toBe(false);
  });
});
