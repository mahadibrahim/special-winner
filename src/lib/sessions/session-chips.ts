/**
 * Shared skill-slug resolution behind a session's glow/grow chips.
 *
 * Both the live payload (GET /api/coach/sessions/[id]/live, chip seed for
 * setup/field/wrap-up) and the glows endpoint's server-side revalidation
 * (POST /api/coach/sessions/[id]/glows) need "which skill slugs legally
 * back this session's chips" — and they must agree, or the live payload can
 * offer a chip the glows POST then rejects with 400 "Unknown glow chip".
 *
 * That drift is exactly what happened before this module existed: the
 * glows endpoint derived skill ids ONLY from sessionActivityUsage rows
 * (recorded when a coach actually uses/saves an activity in-session), while
 * live.ts derived them from focusSkillIds ∪ segments' activities. A
 * prescribed (blueprint-distributed) session — or any session never
 * resaved after creation — has focusSkillIds and/or segments but no
 * sessionActivityUsage rows, so the live payload offered skill chips the
 * glows POST didn't recognize. Wrap-up's Finish then failed permanently on
 * that path.
 *
 * The fix: resolve skill ids from the union of all three sources a session
 * can carry them in, so the legal set only ever widens, never narrows
 * between the two call sites.
 */
import { getDb } from "@/lib/db";
import { sessionPlans, sessionActivityUsage, activities, skills } from "@/lib/db/schema";
import { eq, asc, inArray } from "drizzle-orm";

export async function resolveSessionChipSkillSlugs(sessionId: string): Promise<string[]> {
  const db = getDb();

  const [sessionRow] = await db
    .select({
      segments: sessionPlans.segments,
      focusSkillIds: sessionPlans.focusSkillIds,
    })
    .from(sessionPlans)
    .where(eq(sessionPlans.id, sessionId));

  // (a) sessionActivityUsage rows -> activities.skillsDeveloped.
  const usageRows = await db
    .select({ activityId: sessionActivityUsage.activityId })
    .from(sessionActivityUsage)
    .where(eq(sessionActivityUsage.sessionPlanId, sessionId));

  // (b) the session's segments[].activityId -> activities.skillsDeveloped.
  const segmentActivityIds = (sessionRow?.segments ?? [])
    .map((s) => s.activityId)
    .filter((a): a is string => !!a);

  const activityIds = [
    ...new Set([...usageRows.map((u) => u.activityId), ...segmentActivityIds]),
  ];

  // (c) the session's own focusSkillIds.
  const skillIds = new Set<string>(sessionRow?.focusSkillIds ?? []);

  if (activityIds.length > 0) {
    const activityRows = await db
      .select({ skillsDeveloped: activities.skillsDeveloped })
      .from(activities)
      .where(inArray(activities.id, activityIds));
    for (const a of activityRows) {
      for (const skillId of a.skillsDeveloped ?? []) skillIds.add(skillId);
    }
  }

  if (skillIds.size === 0) return [];

  const skillRows = await db
    .select({ slug: skills.slug })
    .from(skills)
    .where(inArray(skills.id, [...skillIds]))
    .orderBy(asc(skills.slug));

  return skillRows.map((s) => s.slug);
}
