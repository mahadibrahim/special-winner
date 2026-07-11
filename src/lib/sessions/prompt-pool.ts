import type { LivePrompt, LiveSegment } from "./types";

const DEFAULT_CAP = 40;

/** Priority-desc, stable, capped — the shape the live payload ships. */
export function orderPromptPool(prompts: LivePrompt[], cap = DEFAULT_CAP): LivePrompt[] {
  return [...prompts].sort((a, b) => b.priority - a.priority).slice(0, cap);
}

/**
 * The one prompt to show for the current segment: skill-matched prompts
 * first (any of the segment's activity skills), then generic (skillId
 * null); cycleIndex taps through the combined list with wraparound.
 */
export function promptForSegment(
  pool: LivePrompt[],
  segment: LiveSegment,
  cycleIndex: number,
): LivePrompt | null {
  const skillSet = new Set(segment.activitySkillIds);
  const matched = pool.filter((p) => p.skillId !== null && skillSet.has(p.skillId));
  const generic = pool.filter((p) => p.skillId === null);
  const candidates = [...matched, ...generic];
  if (candidates.length === 0) return null;
  return candidates[cycleIndex % candidates.length];
}
