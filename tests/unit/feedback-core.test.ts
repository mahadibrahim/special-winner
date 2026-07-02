import { describe, it, expect } from "vitest";
import { npsCategory } from "@/lib/feedback/constants";
import {
  generateFeedbackToken,
  hashFeedbackToken,
  buildFeedbackUrl,
} from "@/lib/feedback/tokens";

describe("npsCategory", () => {
  it("classifies the standard NPS bands", () => {
    expect(npsCategory(10)).toBe("promoter");
    expect(npsCategory(9)).toBe("promoter");
    expect(npsCategory(8)).toBe("passive");
    expect(npsCategory(7)).toBe("passive");
    expect(npsCategory(6)).toBe("detractor");
    expect(npsCategory(0)).toBe("detractor");
  });
});

describe("feedback tokens", () => {
  it("generates unique high-entropy tokens", () => {
    const a = generateFeedbackToken();
    const b = generateFeedbackToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("hashes deterministically to sha256 hex", () => {
    const t = generateFeedbackToken();
    expect(hashFeedbackToken(t)).toBe(hashFeedbackToken(t));
    expect(hashFeedbackToken(t)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashFeedbackToken(t)).not.toBe(hashFeedbackToken(t + "x"));
  });

  it("builds the public URL", () => {
    expect(buildFeedbackUrl("abc123", "https://aspiresportsohio.com")).toBe(
      "https://aspiresportsohio.com/feedback/abc123",
    );
    expect(buildFeedbackUrl("abc123", "https://aspiresportsohio.com/")).toBe(
      "https://aspiresportsohio.com/feedback/abc123",
    );
  });
});
