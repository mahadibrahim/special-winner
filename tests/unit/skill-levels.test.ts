// tests/unit/skill-levels.test.ts
import { describe, it, expect } from "vitest"
import { skillLevelDisplay, SKILL_LEVEL_TIERS } from "@/lib/landing/skill-levels"

describe("skillLevelDisplay", () => {
  it("maps the three real DB enum values to display labels", () => {
    expect(skillLevelDisplay("recreational").label).toBe("Recreational")
    expect(skillLevelDisplay("intermediate").label).toBe("Intermediate")
    expect(skillLevelDisplay("advanced").label).toBe("Advanced")
  })
  it("renders all_levels as 'All levels'", () => {
    expect(skillLevelDisplay("all_levels").label).toBe("All levels")
  })
  it("falls back to all_levels for unknown values", () => {
    expect(skillLevelDisplay("bogus").label).toBe("All levels")
  })
})

describe("SKILL_LEVEL_TIERS", () => {
  it("explains exactly the three real tiers, in order, excluding all_levels", () => {
    expect(SKILL_LEVEL_TIERS.map((t) => t.level)).toEqual([
      "recreational", "intermediate", "advanced",
    ])
  })
})
