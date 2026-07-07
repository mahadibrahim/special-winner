import { describe, it, expect } from "vitest";
import { ejectionSchema } from "@/lib/suspensions/ejection-schema";

const base = {
  side: "home" as const,
  player: "#7",
  minute: 65,
  reason: "Violent conduct",
  carriesSuspension: false,
};

describe("ejectionSchema", () => {
  it("accepts a valid ejection without a suspension", () => {
    const result = ejectionSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it("accepts a valid ejection with a suspension", () => {
    const result = ejectionSchema.safeParse({
      ...base,
      carriesSuspension: true,
      gamesMissed: 2,
      suspensionNotes: "Escalated after prior yellow",
      escalatedToDirector: true,
    });
    expect(result.success).toBe(true);
  });

  it("defaults escalatedToDirector to false when omitted", () => {
    const result = ejectionSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.escalatedToDirector).toBe(false);
  });

  it("rejects a missing reason", () => {
    const { reason, ...withoutReason } = base;
    const result = ejectionSchema.safeParse(withoutReason);
    expect(result.success).toBe(false);
  });

  it("rejects an empty reason", () => {
    const result = ejectionSchema.safeParse({ ...base, reason: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative gamesMissed", () => {
    const result = ejectionSchema.safeParse({
      ...base,
      carriesSuspension: true,
      gamesMissed: -1,
    });
    expect(result.success).toBe(false);
  });

  it("rejects a bad side", () => {
    const result = ejectionSchema.safeParse({ ...base, side: "referee" });
    expect(result.success).toBe(false);
  });

  it("rejects a player name over 120 characters", () => {
    const result = ejectionSchema.safeParse({ ...base, player: "x".repeat(121) });
    expect(result.success).toBe(false);
  });

  it("rejects an empty player name", () => {
    const result = ejectionSchema.safeParse({ ...base, player: "" });
    expect(result.success).toBe(false);
  });
});
