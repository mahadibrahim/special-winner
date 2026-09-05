/**
 * GET/PUT /api/admin/classes/sessions/:id/coaches
 *
 * Task 3 of the 2026-09-05-coach-classes-phase01 plan: per-session coach
 * staffing override. `PUT { lead, assistants }` replaces the `class_session`
 * coach assignment set for exactly this one materialized session (a
 * `drop_in_sessions` row), independent of its template's set — the one-off
 * substitute-coverage path (e.g. the usual lead coach is out one week).
 *
 * A session normally inherits its template's coach set exactly once, at
 * materialization time (src/lib/classes/materialize.ts's
 * `copyTemplateCoachesToSession`). This endpoint is how an admin overrides
 * that for a single occurrence without touching the template — and that
 * override sticks: nothing re-syncs it from the template afterward unless an
 * admin explicitly replaces the template's set with
 * `applyToMaterialized: true` (see `templates/[id]/coaches.ts`'s header for
 * why that path is a blunt, no-mercy replace in Phase 1).
 *
 * Guards mirror `templates/[id]/roster.ts`: org-admin gated
 * (`requireOrgAdminAccess`), session ownership pinned to the resolved org AND
 * `kind = 'class'` — a pickup `drop_in_sessions` row 404s here rather than
 * accepting class-shaped staffing writes it has no `class_slot_templates`
 * relationship to (mirrors `coach/class-sessions/[id]/glows.ts`'s
 * `session.kind !== "class"` check). Coach ids in the body are validated as
 * actual org coaching staff (`isOrgCoachingStaff`) — an id that isn't gets a
 * 422.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { setCoachesFor, getCoachesFor } from "@/lib/coach/coaching-assignments";
import {
  coachesBodySchema,
  firstInvalidCoachId,
  namedCoachIds,
  mapSetCoachesError,
} from "@/lib/classes/admin-staffing";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function loadOwnedSession(orgId: string, id: string) {
  const [row] = await getDb()
    .select({ id: dropInSessions.id })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, id),
        eq(dropInSessions.organizationId, orgId),
        eq(dropInSessions.kind, "class"),
      ),
    )
    .limit(1);
  return row ?? null;
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Session id required" }, 400);

  const session = await loadOwnedSession(orgId, id);
  if (!session) return json({ error: "Session not found" }, 404);

  const coaches = await getCoachesFor("class_session", id);
  return json({ coaches }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Session id required" }, 400);

  const session = await loadOwnedSession(orgId, id);
  if (!session) return json({ error: "Session not found" }, 404);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = coachesBodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  const badCoachId = await firstInvalidCoachId(namedCoachIds(input), orgId);
  if (badCoachId) {
    return json(
      { error: "invalid_coach", message: `${badCoachId} is not a coach in this organization` },
      422,
    );
  }

  try {
    await setCoachesFor({
      organizationId: orgId,
      kind: "class_session",
      targetId: id,
      lead: input.lead,
      assistants: input.assistants,
      createdByUserId: auth.user.id,
    });
  } catch (err) {
    const mapped = mapSetCoachesError(err);
    if (mapped) return mapped;
    throw err;
  }

  const coaches = await getCoachesFor("class_session", id);
  return json({ coaches }, 200);
};
