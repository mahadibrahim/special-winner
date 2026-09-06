export interface CampPodCandidate {
  registrationId: string;
  familyMemberId: string;
  birthDate: string | null; // ISO date; null = unknown DOB (staff-adjustable)
  skillScore: number | null; // avg playerSkillSummary.currentLevel; null = never assessed
  gender: string | null;
}
export interface CampPodDraft {
  teamId: string;
  registrationIds: string[];
}

/**
 * Draft camp candidates into pods (teams) using a contiguous *banded* fill,
 * not greedy least-loaded placement (contrast `draft-placements.ts`). Pure +
 * deterministic (no Date.now/randomness): both inputs are copied and sorted
 * before processing, so a caller's array ordering never affects the result.
 *
 * Algorithm:
 * 1. Sort candidates by the strategy key (see below), tie-broken by
 *    `registrationId` ascending. Sort pods by `teamId` ascending.
 * 2. Compute even band sizes for `n` candidates over `k` pods:
 *    `base = floor(n / k)`, `remainder = n % k`. The first `remainder` pods
 *    (in teamId-asc order) get `base + 1`; the rest get `base`. This is the
 *    same "largest remainder first" split as `13 / 3 -> 5-4-4`.
 * 3. Walk the pods left to right, clamping each pod's target against its
 *    `maxRosterSize` (`null` = uncapped). Any amount a pod can't hold
 *    (`target - cap`, when positive) carries forward as extra target size
 *    added onto the *next* pod — so an early cap doesn't strand capacity a
 *    later uncapped (or under-target) pod could still absorb. Carry that
 *    survives past the last pod cannot be placed anywhere.
 * 4. Slice the sorted candidates array contiguously using the final
 *    per-pod sizes: pod 1 gets the first band, pod 2 the next, etc. Whatever
 *    is left over after the last pod (exactly the final carry from step 3)
 *    becomes `unplaced`, preserving sorted order. Every input
 *    `registrationId` appears exactly once across `pods[].registrationIds` +
 *    `unplaced` — the conservation invariant.
 *
 * Strategy keys:
 * - `"age"`: `birthDate` descending (youngest first). `null` birthDates sort
 *   last (unknown DOB never jumps the youngest band).
 * - `"skill"`: `skillScore` ascending (least-skilled first). `null` scores
 *   sort last, landing in the final band — per owner decision, unassessed
 *   campers default there and staff adjusts manually.
 *
 * Zero pods: every candidate is unplaced (in sorted-key order). Zero
 * candidates: every pod is present with an empty `registrationIds` array.
 */
export function draftCampPods(
  candidates: CampPodCandidate[],
  pods: Array<{ teamId: string; maxRosterSize: number | null }>,
  strategy: "age" | "skill",
): { pods: CampPodDraft[]; unplaced: string[] } {
  const compare = strategy === "age" ? compareByAge : compareBySkill;
  const sortedCandidates = [...candidates].sort(compare);
  const sortedPods = [...pods].sort((a, b) => a.teamId.localeCompare(b.teamId));

  if (sortedPods.length === 0) {
    return { pods: [], unplaced: sortedCandidates.map((c) => c.registrationId) };
  }

  const n = sortedCandidates.length;
  const k = sortedPods.length;
  const base = Math.floor(n / k);
  const remainder = n % k;

  let carry = 0;
  const sizes: number[] = [];
  for (let i = 0; i < k; i++) {
    const evenTarget = base + (i < remainder ? 1 : 0);
    const target = evenTarget + carry;
    const cap = sortedPods[i].maxRosterSize ?? Infinity;
    const assigned = Math.min(target, cap);
    sizes.push(assigned);
    carry = target - assigned;
  }

  const podDrafts: CampPodDraft[] = [];
  let cursor = 0;
  for (let i = 0; i < k; i++) {
    const size = sizes[i];
    const band = sortedCandidates.slice(cursor, cursor + size);
    cursor += size;
    podDrafts.push({
      teamId: sortedPods[i].teamId,
      registrationIds: band.map((c) => c.registrationId),
    });
  }

  const unplaced = sortedCandidates.slice(cursor).map((c) => c.registrationId);

  return { pods: podDrafts, unplaced };
}

function compareByAge(a: CampPodCandidate, b: CampPodCandidate): number {
  if (a.birthDate === null && b.birthDate === null) {
    return a.registrationId.localeCompare(b.registrationId);
  }
  if (a.birthDate === null) return 1; // nulls sort last
  if (b.birthDate === null) return -1;
  if (a.birthDate !== b.birthDate) {
    // descending: more recent (larger) birthDate — i.e. younger — first
    return a.birthDate > b.birthDate ? -1 : 1;
  }
  return a.registrationId.localeCompare(b.registrationId);
}

function compareBySkill(a: CampPodCandidate, b: CampPodCandidate): number {
  if (a.skillScore === null && b.skillScore === null) {
    return a.registrationId.localeCompare(b.registrationId);
  }
  if (a.skillScore === null) return 1; // nulls sort last
  if (b.skillScore === null) return -1;
  if (a.skillScore !== b.skillScore) {
    return a.skillScore - b.skillScore; // ascending
  }
  return a.registrationId.localeCompare(b.registrationId);
}
