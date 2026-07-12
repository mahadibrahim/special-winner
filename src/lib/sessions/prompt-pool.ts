import type { LivePrompt, LiveSegment } from "./types";

const DEFAULT_CAP = 40;

/** Priority-desc, stable, capped — the shape the live payload ships. */
export function orderPromptPool(prompts: LivePrompt[], cap = DEFAULT_CAP): LivePrompt[] {
  return [...prompts].sort((a, b) => b.priority - a.priority).slice(0, cap);
}

/**
 * The one prompt to show for the current segment: skill-matched prompts
 * first (any of the segment's activity skills). Distribution skill-linkage
 * fix — second tier, ONLY when no segment-matched prompt exists: every
 * other skill-linked prompt in the pool (skillId !== null). These are
 * session-relevant by construction of the live-payload query (it only
 * pulls prompts tied to skills actually in play for this session), so
 * they're a better fallback than jumping straight to fully generic
 * (skillId === null) prompts — which remain the last resort. cycleIndex
 * taps through the combined list with wraparound.
 */
export function promptForSegment(
  pool: LivePrompt[],
  segment: LiveSegment,
  cycleIndex: number,
): LivePrompt | null {
  const skillSet = new Set(segment.activitySkillIds);
  const matched = pool.filter((p) => p.skillId !== null && skillSet.has(p.skillId));
  const generic = pool.filter((p) => p.skillId === null);
  const skillLinked = pool.filter((p) => p.skillId !== null);
  const tierTwo = matched.length === 0 ? skillLinked : [];
  const candidates = [...matched, ...tierTwo.filter((p) => !matched.includes(p)), ...generic];
  if (candidates.length === 0) return null;
  return candidates[cycleIndex % candidates.length];
}
