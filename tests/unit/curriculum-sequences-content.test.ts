import { describe, it, expect } from "vitest";
import { CURRICULUM_CONTENT } from "@/lib/curriculum/content";
import {
  REFERENCE_SEQUENCES,
  validateSequences,
} from "@/lib/curriculum/content/sequences";

describe("reference curriculum sequences", () => {
  it("passes registry validation (all template names, sports, stages resolve)", () => {
    expect(validateSequences(CURRICULUM_CONTENT, REFERENCE_SEQUENCES)).toEqual([]);
  });

  it("covers every live sport/stage combo that has session plans", () => {
    const liveCombos = new Set(
      CURRICULUM_CONTENT.sessionPlans.map(
        (p) => `${p.sport}::${p.stage ?? "fundamentals"}`,
      ),
    );
    const coveredCombos = new Set(
      REFERENCE_SEQUENCES.map((s) => `${s.sport}::${s.stage}`),
    );
    for (const combo of liveCombos) {
      expect(
        coveredCombos.has(combo),
        `missing a reference sequence for ${combo}`,
      ).toBe(true);
    }
  });

  it("every sequence has at least two ordered entries", () => {
    for (const seq of REFERENCE_SEQUENCES) {
      expect(seq.entries.length, seq.name).toBeGreaterThanOrEqual(2);
    }
  });

  it("sequence names are unique per sport (loader natural key)", () => {
    const seen = new Set<string>();
    for (const seq of REFERENCE_SEQUENCES) {
      const key = `${seq.sport}::${seq.name}`;
      expect(seen.has(key), `duplicate ${key}`).toBe(false);
      seen.add(key);
    }
  });
});
