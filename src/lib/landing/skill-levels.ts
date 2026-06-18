// src/lib/landing/skill-levels.ts
export type SkillLevel = "recreational" | "intermediate" | "advanced" | "all_levels"

export interface SkillLevelDisplay {
  label: string
  /** Tailwind badge classes — green / amber / rose / neutral. */
  badgeClass: string
}

const MAP: Record<SkillLevel, SkillLevelDisplay> = {
  recreational: { label: "Recreational", badgeClass: "bg-emerald-100 text-emerald-800" },
  intermediate: { label: "Intermediate", badgeClass: "bg-amber-100 text-amber-800" },
  advanced: { label: "Advanced", badgeClass: "bg-rose-100 text-rose-800" },
  all_levels: { label: "All levels", badgeClass: "bg-zinc-100 text-zinc-700" },
}

export function skillLevelDisplay(level: string): SkillLevelDisplay {
  return MAP[level as SkillLevel] ?? MAP.all_levels
}

/** Content for the "Find your level" explainer — the three real tiers only. */
export const SKILL_LEVEL_TIERS: ReadonlyArray<{
  level: Exclude<SkillLevel, "all_levels">
  display: SkillLevelDisplay
  headline: string
  blurb: string
}> = [
  {
    level: "recreational", display: MAP.recreational,
    headline: "Just here to play",
    blurb: "Relaxed, social, all-levels welcome. New to the sport or shaking off the rust — start here.",
  },
  {
    level: "intermediate", display: MAP.intermediate,
    headline: "Competitive but friendly",
    blurb: "You know the game and want a real run, without it getting heated. The default for most players.",
  },
  {
    level: "advanced", display: MAP.advanced,
    headline: "High-level run",
    blurb: "Fast, physical, experienced players. Former club/college and serious weekend ballers.",
  },
]
