import { describe, it, expect } from "vitest";
import { deriveAudience } from "@/lib/programs/derive";

const program = { programType: "camp", audienceType: "parents" } as any;

describe("deriveAudience with explicit age range", () => {
  it("classifies a 5-12 camp as youth", () => {
    expect(deriveAudience({ program, minAge: 5, maxAge: 12 } as any)).toBe("youth");
  });

  it("classifies an 18+ offering as adult", () => {
    expect(deriveAudience({ program, minAge: 18, maxAge: 99 } as any)).toBe("adult");
  });

  it("falls back to audienceType when no age range is set", () => {
    expect(deriveAudience({ program } as any)).toBe("youth");
  });
});
