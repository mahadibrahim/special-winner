import { describe, it, expect } from "vitest";
import { clampLimit } from "@/lib/http/clamp-limit";

describe("clampLimit", () => {
  it("returns the fallback for null", () => expect(clampLimit(null, 20)).toBe(20));
  it("returns the fallback for NaN", () => expect(clampLimit("abc", 20)).toBe(20));
  it("clamps to max 100 by default", () => expect(clampLimit("9999", 20)).toBe(100));
  it("clamps to min 1", () => expect(clampLimit("0", 20)).toBe(1));
  it("clamps negatives to 1", () => expect(clampLimit("-5", 20)).toBe(1));
  it("passes through in-range values", () => expect(clampLimit("50", 20)).toBe(50));
  it("respects a custom max", () => expect(clampLimit("50", 5, 10)).toBe(10));
});
