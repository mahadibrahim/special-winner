import type { APIRoute } from "astro";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { roles, teams, userRoles, users } from "@/lib/db/schema";
import { requireOrgAdminAccess } from "@/lib/auth";
import {
  requireUserInOrg,
  ownershipDeniedResponse,
} from "@/lib/auth/require-resource-ownership";
import { getOnboardingTasksBatch } from "@/lib/coach/onboarding-data";
import { coachOnboardingProgress } from "@/lib/db/schema/coach-onboarding";
import { ADMIN_CONFIRM_TASK_KEYS } from "@/lib/compliance/coach-onboarding";

export const prerender = false;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/**
 * GET  — every coach holding an org-scoped `coach` role in the caller's
 *        org, each with their merged onboarding task list + overall
 *        completion. See Design decision 8 (plan doc) for the accepted N+1
 *        query shape at expected org sizes.
 * POST — admin confirms an admin_confirm-kind task (today: only
 *        shadow_session_confirmed) for one coach. Idempotent.
 */
export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const db = getDb();

  const coachRows = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
    })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .innerJoin(users, eq(userRoles.userId, users.id))
    .where(
      and(
        eq(roles.name, "coach"),
        eq(userRoles.scopeType, "organization"),
        eq(userRoles.scopeId, auth.organizationId),
      ),
    )
    .orderBy(asc(users.lastName), asc(users.firstName), asc(users.id));

  const seen = new Set<string>();
  const uniqueCoaches = coachRows.filter((c) =>
    seen.has(c.id) ? false : (seen.add(c.id), true),
  );
  const coachIds = uniqueCoaches.map((c) => c.id);

  const coachTeamRows =
    coachIds.length > 0
      ? await db
          .select({
            id: teams.id,
            coachUserId: teams.coachUserId,
            assistantCoachUserId: teams.assistantCoachUserId,
          })
          .from(teams)
          .where(
            or(
              inArray(teams.coachUserId, coachIds),
              inArray(teams.assistantCoachUserId, coachIds),
            ),
          )
      : [];

  const teamIdsByCoach = new Map<string, string[]>();
  for (const c of uniqueCoaches) {
    teamIdsByCoach.set(
      c.id,
      coachTeamRows
        .filter((t) => t.coachUserId === c.id || t.assistantCoachUserId === c.id)
        .map((t) => t.id),
    );
  }

  const tasksByCoach = await getOnboardingTasksBatch(
    db,
    uniqueCoaches.map((c) => ({
      userId: c.id,
      teamIds: teamIdsByCoach.get(c.id) ?? [],
    })),
    auth.organizationId,
  );

  const coaches = uniqueCoaches.map((c) => {
    const { tasks, complete } = tasksByCoach.get(c.id)!;
    return {
      id: c.id,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      tasks,
      complete,
    };
  });

  return json(200, { coaches });
};

const confirmSchema = z.object({
  userId: z.string().uuid(),
  taskKey: z.enum(ADMIN_CONFIRM_TASK_KEYS as [string, ...string[]]),
});

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  let parsed;
  try {
    parsed = confirmSchema.safeParse(await context.request.json());
  } catch {
    return json(400, { error: "Invalid JSON" });
  }
  if (!parsed.success) {
    return json(400, {
      error: "Validation failed",
      details: parsed.error.flatten().fieldErrors,
    });
  }

  const ownership = await requireUserInOrg(
    auth.organizationId,
    parsed.data.userId,
  );
  if (!ownership.ok) return ownershipDeniedResponse();

  const db = getDb();
  const [existing] = await db
    .select()
    .from(coachOnboardingProgress)
    .where(
      and(
        eq(coachOnboardingProgress.userId, parsed.data.userId),
        eq(coachOnboardingProgress.organizationId, auth.organizationId),
        eq(coachOnboardingProgress.taskKey, parsed.data.taskKey),
      ),
    )
    .orderBy(asc(coachOnboardingProgress.createdAt))
    .limit(1);

  if (!existing) {
    await db.insert(coachOnboardingProgress).values({
      userId: parsed.data.userId,
      organizationId: auth.organizationId,
      taskKey: parsed.data.taskKey,
      completedAt: new Date(),
    });
  }

  return json(200, { confirmed: true });
};
