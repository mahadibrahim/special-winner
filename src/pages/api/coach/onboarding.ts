import type { APIRoute } from "astro";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { requireCoachPortalAccess } from "@/lib/auth";
import { coachOnboardingProgress } from "@/lib/db/schema/coach-onboarding";
import { getOnboardingTasks } from "@/lib/coach/onboarding-data";
import { MANUAL_TASK_KEYS } from "@/lib/compliance/coach-onboarding";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET  — the coach's own checklist: manual + auto + admin-confirm tasks,
 *        auto tasks computed live (and persisted write-once when newly
 *        complete — see src/lib/coach/onboarding-data.ts).
 * POST — mark ONE manual task complete. Auto and admin-confirm task keys
 *        are rejected (400) — those are set by the system or an admin.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  const db = getDb();
  const { tasks, complete } = await getOnboardingTasks(
    db,
    auth.user.id,
    auth.organizationId,
    auth.teamIds,
  );
  return json(200, { tasks, complete });
};

const postSchema = z.object({
  taskKey: z.enum(MANUAL_TASK_KEYS as [string, ...string[]]),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireCoachPortalAccess(context);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = postSchema.safeParse(await context.request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) {
    return json(400, {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(coachOnboardingProgress)
    .where(
      and(
        eq(coachOnboardingProgress.userId, auth.user.id),
        eq(coachOnboardingProgress.organizationId, auth.organizationId),
        eq(coachOnboardingProgress.taskKey, parsed.data.taskKey),
      ),
    )
    .orderBy(asc(coachOnboardingProgress.createdAt))
    .limit(1);

  if (!existing) {
    await db.insert(coachOnboardingProgress).values({
      userId: auth.user.id,
      organizationId: auth.organizationId,
      taskKey: parsed.data.taskKey,
      completedAt: new Date(),
    });
  }

  const { tasks, complete } = await getOnboardingTasks(
    db,
    auth.user.id,
    auth.organizationId,
    auth.teamIds,
  );
  return json(200, { tasks, complete });
};
