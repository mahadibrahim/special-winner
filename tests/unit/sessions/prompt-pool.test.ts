import { describe, it, expect } from "vitest";
import { orderPromptPool, promptForSegment } from "@/lib/sessions/prompt-pool";
import type { LivePrompt, LiveSegment } from "@/lib/sessions/types";

const p = (id: string, priority: number, skillId: string | null): LivePrompt => ({
  id, priority, skillId, promptType: "tip", content: `prompt ${id}`,
});
const seg = (activitySkillIds: string[]): LiveSegment => ({
  order: 0, name: "s", type: "technical", durationMinutes: 10, activitySkillIds,
  activityDiagram: null,
});

describe("orderPromptPool", () => {
  it("orders by priority desc, stable on ties, caps at 40 by default", () => {
    const pool = orderPromptPool([p("a", 1, null), p("b", 5, null), p("c", 1, null)]);
    expect(pool.map((x) => x.id)).toEqual(["b", "a", "c"]);
    const big = orderPromptPool(
      Array.from({ length: 50 }, (_, i) => p(String(i), 0, null)),
    );
    expect(big).toHaveLength(40);
  });
});

describe("promptForSegment", () => {
  const pool = [p("skillA", 2, "skill-a"), p("generic1", 1, null), p("generic2", 0, null)];

  it("prefers prompts matching the segment's activity skills, then generics", () => {
    expect(promptForSegment(pool, seg(["skill-a"]), 0)?.id).toBe("skillA");
    expect(promptForSegment(pool, seg(["skill-a"]), 1)?.id).toBe("generic1");
  });

  it("cycles with wraparound", () => {
    expect(promptForSegment(pool, seg(["skill-a"]), 3)?.id).toBe("skillA");
  });

  it("returns null on an empty pool", () => {
    expect(promptForSegment([], seg([]), 0)).toBeNull();
  });

  describe("skill-linked tier-two fallback (distribution skill-linkage fix)", () => {
    // Pool has skill-linked prompts, but none match THIS segment's own
    // activitySkillIds (the segment has none, or different ones).
    const poolWithUnrelatedSkillPrompts = [
      p("skillB", 3, "skill-b"),
      p("skillC", 2, "skill-c"),
      p("generic1", 1, null),
      p("generic2", 0, null),
    ];

    it("falls back to skill-linked prompts (any skill) before generics when nothing matches the segment", () => {
      // segment has no activitySkillIds at all (e.g. no activityId resolved)
      const result = promptForSegment(poolWithUnrelatedSkillPrompts, seg([]), 0);
      expect(result?.id).toBe("skillB"); // highest-priority skill-linked prompt, not generic1
    });

    it("orders the tier-two fallback by priority, still before any generic", () => {
      const ids = [0, 1, 2, 3].map(
        (i) => promptForSegment(poolWithUnrelatedSkillPrompts, seg([]), i)?.id,
      );
      expect(ids).toEqual(["skillB", "skillC", "generic1", "generic2"]);
    });

    it("existing matched-first behavior is unchanged when a segment DOES match", () => {
      // seg matches skill-c specifically -- matched tier still wins, and the
      // fallback tier (all skill-linked) does not duplicate it ahead of turn.
      const pool = [p("skillA", 5, "skill-a"), p("skillC", 1, "skill-c"), p("generic1", 0, null)];
      expect(promptForSegment(pool, seg(["skill-c"]), 0)?.id).toBe("skillC");
      expect(promptForSegment(pool, seg(["skill-c"]), 1)?.id).toBe("generic1");
    });

    it("does not fall back to skill-linked tier when matched prompts already exist, even if incomplete", () => {
      // matched.length > 0, so tier two must be empty -- candidates are
      // exactly matched + generic, same as the original behavior.
      const pool = [p("skillA", 5, "skill-a"), p("skillB", 4, "skill-b"), p("generic1", 0, null)];
      const seg2 = seg(["skill-a"]);
      expect(promptForSegment(pool, seg2, 0)?.id).toBe("skillA");
      expect(promptForSegment(pool, seg2, 1)?.id).toBe("generic1");
      // skillB (unrelated skill-linked) never appears for this segment.
      const ids = [0, 1].map((i) => promptForSegment(pool, seg2, i)?.id);
      expect(ids).not.toContain("skillB");
    });
  });
});
