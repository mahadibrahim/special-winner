import { describe, it, expect } from "vitest";
import { orderPromptPool, promptForSegment } from "@/lib/sessions/prompt-pool";
import type { LivePrompt, LiveSegment } from "@/lib/sessions/types";

const p = (id: string, priority: number, skillId: string | null): LivePrompt => ({
  id, priority, skillId, promptType: "tip", content: `prompt ${id}`,
});
const seg = (activitySkillIds: string[]): LiveSegment => ({
  order: 0, name: "s", type: "technical", durationMinutes: 10, activitySkillIds,
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
});
