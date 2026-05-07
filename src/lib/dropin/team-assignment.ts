/**
 * Drop-in team assignment.
 *
 * Pure function: given a session's team layout, the new user's skill level,
 * and the existing confirmed bookings (with team + skill), pick the team
 * the new player should join.
 *
 * Algorithm:
 *   1. If the session has no teams (class kind), return null.
 *   2. Pick the smallest team(s) by current count.
 *   3. If multiple teams tie on count, pick the one that produces the
 *      lowest skill-rank gap across all teams once the new player joins.
 *   4. If gaps tie, fall back to the first color in `teamColors` order
 *      (deterministic for tests + replays).
 */

const SKILL_RANK: Record<string, number> = {
  recreational: 1,
  intermediate: 2,
  advanced: 3,
  all_levels: 2,
};

export interface TeamAssignmentSession {
  teamCount: number;
  teamColors: string[];
}

export interface ExistingBookingForAssignment {
  teamAssignment: string | null;
  skillLevel: string;
}

export function assignTeam(
  session: TeamAssignmentSession,
  newUserSkillLevel: string,
  existingBookings: ExistingBookingForAssignment[],
): string | null {
  if (session.teamCount === 0 || session.teamColors.length === 0) return null;

  const counts = new Map<string, number>();
  const skillSums = new Map<string, number>();
  for (const color of session.teamColors) {
    counts.set(color, 0);
    skillSums.set(color, 0);
  }
  for (const b of existingBookings) {
    if (!b.teamAssignment) continue;
    if (!counts.has(b.teamAssignment)) continue;
    counts.set(b.teamAssignment, (counts.get(b.teamAssignment) ?? 0) + 1);
    skillSums.set(
      b.teamAssignment,
      (skillSums.get(b.teamAssignment) ?? 0) + (SKILL_RANK[b.skillLevel] ?? 2),
    );
  }

  const minCount = Math.min(...session.teamColors.map((c) => counts.get(c) ?? 0));
  const candidates = session.teamColors.filter((c) => counts.get(c) === minCount);

  if (candidates.length === 1) return candidates[0];

  // Tie: pick the team that produces the lowest skill-rank gap when this user joins.
  const newSkill = SKILL_RANK[newUserSkillLevel] ?? 2;
  let bestCandidate = candidates[0];
  let bestGap = Infinity;
  for (const c of candidates) {
    const hypotheticalAvgs = session.teamColors.map((color) => {
      const cnt = counts.get(color) ?? 0;
      const sum = skillSums.get(color) ?? 0;
      if (color === c) return (sum + newSkill) / (cnt + 1);
      return cnt > 0 ? sum / cnt : 2;
    });
    const gap = Math.max(...hypotheticalAvgs) - Math.min(...hypotheticalAvgs);
    if (gap < bestGap) {
      bestGap = gap;
      bestCandidate = c;
    }
  }
  return bestCandidate;
}
