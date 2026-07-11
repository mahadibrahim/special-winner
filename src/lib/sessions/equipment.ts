/**
 * Union of the plan-level equipment list and each segment activity's list.
 * Plan items first, then activity items in segment order; case-insensitive
 * dedupe keeps the first casing seen (coaches read this on a phone —
 * "Cones" and "cones" are the same pile).
 */
export function deriveEquipment(
  planEquipment: string[] | null,
  activityEquipment: Array<string[] | null>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of [...(planEquipment ?? []), ...activityEquipment.flatMap((a) => a ?? [])]) {
    const key = item.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item.trim());
  }
  return out;
}
