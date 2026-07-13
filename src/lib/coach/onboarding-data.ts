import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import type { getDb } from "@/lib/db";
import {
  coachOnboardingProgress,
  type CoachOnboardingProgress,
} from "@/lib/db/schema/coach-onboarding";
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

/**
 * Batched equivalent of calling `getOnboardingTasks` once per coach — used
 * by the admin coach-list endpoint (GET /api/admin/coaches/onboarding),
 * which previously ran the single-coach path N times (2-3 queries each,
 * pool-capped at 5 connections). This does the same reads/writes as 3
 * batched round trips total, independent of coach count, mirroring the
 * inArray + groupBy shape in coaches/credentials/index.ts.
 *
 * Does NOT replace `getOnboardingTasks` — the coach's own single-user
 * onboarding page still uses that directly.
 */
export async function getOnboardingTasksBatch(
  db: DB,
  coaches: ReadonlyArray<{ userId: string; teamIds: string[] }>,
  organizationId: string,
): Promise<Map<string, { tasks: OnboardingTaskStatus[]; complete: boolean }>> {
  const userIds = coaches.map((c) => c.userId);
  if (userIds.length === 0) return new Map();

  const allTeamIds = [...new Set(coaches.flatMap((c) => c.teamIds))];

  const [progressRows, credentialRows, planRows] = await Promise.all([
    db
      .select()
      .from(coachOnboardingProgress)
      .where(
        and(
          inArray(coachOnboardingProgress.userId, userIds),
          eq(coachOnboardingProgress.organizationId, organizationId),
        ),
      ),
    db
      .select()
      .from(coachCredentials)
      .where(
        and(
          inArray(coachCredentials.userId, userIds),
          or(
            eq(coachCredentials.organizationId, organizationId),
            isNull(coachCredentials.organizationId),
          ),
        ),
      ),
    allTeamIds.length > 0
      ? db
          .select({ id: sessionPlans.id, teamId: sessionPlans.teamId })
          .from(sessionPlans)
          .where(inArray(sessionPlans.teamId, allTeamIds))
      : Promise.resolve([]),
  ]);

  const progressByUser = new Map<string, CoachOnboardingProgress[]>();
  for (const row of progressRows) {
    const existing = progressByUser.get(row.userId) ?? [];
    existing.push(row);
    progressByUser.set(row.userId, existing);
  }

  const credentialsByUser = new Map<string, typeof credentialRows>();
  for (const row of credentialRows) {
    const existing = credentialsByUser.get(row.userId) ?? [];
    existing.push(row);
    credentialsByUser.set(row.userId, existing);
  }

  const teamsWithPlan = new Set(planRows.map((p) => p.teamId));
  const now = new Date();

  // First pass: compute auto flags + collect the write-once inserts needed
  // (mirrors the single-coach getOnboardingTasks logic exactly).
  const perCoach = new Map<
    string,
    { rows: CoachOnboardingProgress[]; autoFlags: AutoFlags }
  >();
  const toInsert: (typeof coachOnboardingProgress.$inferInsert)[] = [];

  for (const c of coaches) {
    const rows = [...(progressByUser.get(c.userId) ?? [])];
    const credRows = credentialsByUser.get(c.userId) ?? [];
    const gaps = requiredCredentialGaps(credRows, now);
    const hasPlan = c.teamIds.some((id) => teamsWithPlan.has(id));
    const autoFlags: AutoFlags = {
      credentials_complete: gaps.length === 0,
      first_practice_plan_created: hasPlan,
    };

    const alreadyRecorded = new Set(rows.map((r) => r.taskKey));
    for (const key of AUTO_TASK_KEYS) {
      const flagTrue = autoFlags[key as keyof AutoFlags];
      if (flagTrue && !alreadyRecorded.has(key)) {
        toInsert.push({
          userId: c.userId,
          organizationId,
          taskKey: key,
          completedAt: now,
        });
      }
    }

    perCoach.set(c.userId, { rows, autoFlags });
  }

  // Second pass: one batched write-once insert for every coach's
  // newly-completed auto task, instead of up to N separate inserts.
  if (toInsert.length > 0) {
    const inserted = await db
      .insert(coachOnboardingProgress)
      .values(toInsert)
      .onConflictDoNothing({
        target: [
          coachOnboardingProgress.userId,
          coachOnboardingProgress.organizationId,
          coachOnboardingProgress.taskKey,
        ],
      })
      .returning();
    for (const row of inserted) {
      perCoach.get(row.userId)?.rows.push(row);
    }
  }

  const result = new Map<
    string,
    { tasks: OnboardingTaskStatus[]; complete: boolean }
  >();
  for (const c of coaches) {
    const entry = perCoach.get(c.userId)!;
    const tasks = mergeOnboardingTasks(entry.rows, entry.autoFlags);
    result.set(c.userId, { tasks, complete: tasks.every((t) => t.completed) });
  }
  return result;
}
