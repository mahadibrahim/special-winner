import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import { coachOnboardingProgress } from "@/lib/db/schema/coach-onboarding";
import { coachCredentials } from "@/lib/db/schema/coach-credentials";
import { sessionPlans } from "@/lib/db/schema/practice-planning";
import { requiredCredentialGaps } from "@/lib/compliance/coach-credentials";
import {
  mergeOnboardingTasks,
  AUTO_TASK_KEYS,
  type AutoFlags,
  type OnboardingTaskStatus,
} from "@/lib/compliance/coach-onboarding";

type DB = ReturnType<typeof getDb>;

/**
 * Live-computes the two auto-detected flags. Credentials: org rows + global
 * (NULL-org) rows for this user, same visibility rule as the Phase 1
 * compliance grid. Practice plan: any session_plans row for a team this
 * coach heads or assists — empty teamIds (a freshly hired coach with no
 * assignment yet) trivially yields false without a query.
 */
export async function computeAutoFlags(
  db: DB,
  userId: string,
  organizationId: string,
  teamIds: string[],
): Promise<AutoFlags> {
  const credentialRows = await db
    .select()
    .from(coachCredentials)
    .where(
      and(
        eq(coachCredentials.userId, userId),
        or(
          eq(coachCredentials.organizationId, organizationId),
          isNull(coachCredentials.organizationId),
        ),
      ),
    );
  const gaps = requiredCredentialGaps(credentialRows, new Date());

  let hasPlan = false;
  if (teamIds.length > 0) {
    const [row] = await db
      .select({ id: sessionPlans.id })
      .from(sessionPlans)
      .where(inArray(sessionPlans.teamId, teamIds))
      .orderBy(asc(sessionPlans.createdAt))
      .limit(1);
    hasPlan = !!row;
  }

  return {
    credentials_complete: gaps.length === 0,
    first_practice_plan_created: hasPlan,
  };
}

/**
 * Reads existing progress rows, computes auto flags, persists (write-once)
 * any auto task that just became complete for the first time, and returns
 * the merged, ordered task list plus overall completion.
 */
export async function getOnboardingTasks(
  db: DB,
  userId: string,
  organizationId: string,
  teamIds: string[],
): Promise<{ tasks: OnboardingTaskStatus[]; complete: boolean }> {
  const rows = await db
    .select()
    .from(coachOnboardingProgress)
    .where(
      and(
        eq(coachOnboardingProgress.userId, userId),
        eq(coachOnboardingProgress.organizationId, organizationId),
      ),
    );

  const autoFlags = await computeAutoFlags(db, userId, organizationId, teamIds);

  const alreadyRecorded = new Set(rows.map((r) => r.taskKey));
  for (const key of AUTO_TASK_KEYS) {
    const flagTrue = autoFlags[key as keyof AutoFlags];
    if (flagTrue && !alreadyRecorded.has(key)) {
      const [inserted] = await db
        .insert(coachOnboardingProgress)
        .values({
          userId,
          organizationId,
          taskKey: key,
          completedAt: new Date(),
        })
        .onConflictDoNothing({
          target: [
            coachOnboardingProgress.userId,
            coachOnboardingProgress.organizationId,
            coachOnboardingProgress.taskKey,
          ],
        })
        .returning();
      if (inserted) rows.push(inserted);
    }
  }

  const tasks = mergeOnboardingTasks(rows, autoFlags);
  return { tasks, complete: tasks.every((t) => t.completed) };
}
