/**
 * GET/PUT /api/admin/classes/templates/:id/coaches
 *
 * Task 3 of the 2026-09-05-coach-classes-phase01 plan: admin staffing for a
 * class-slot template.
 *
 * `PUT { lead, assistants, applyToMaterialized? }` replaces the template's
 * `class_template` coach set via `setCoachesFor` (Task 2 —
 * src/lib/coach/coaching-assignments.ts). A plain PUT (no
 * `applyToMaterialized`, or `false`) only ever changes the TEMPLATE's own
 * set — already-materialized sessions are untouched, because a session's
 * coach set is normally seeded ONCE, at the moment
 * `materializeClassSessions` creates it (src/lib/classes/materialize.ts's
 * `copyTemplateCoachesToSession`), not kept in sync afterward.
 *
 * `applyToMaterialized: true` additionally writes the SAME set onto every
 * FUTURE `scheduled` session already materialized from this template —
 * BLUNTLY: every one of them, including sessions an admin previously
 * staffed differently via a one-off
 * `PUT /api/admin/classes/sessions/:id/coaches` override. Phase 1 has no
 * "this session was overridden, leave it alone" marker (a real
 * `sessionStaffingOverridden` flag is a follow-up, not built here) — the
 * admin UI surfacing this flag MUST warn that it clobbers per-session
 * overrides rather than implying it's a smart merge.
 *
 * `GET` returns the template's current set plus every future scheduled
 * session's own set, so an admin UI can show at a glance where a session's
 * staffing has drifted from the template's.
 *
 * Guards mirror `templates/[id]/roster.ts`: org-admin gated
 * (`requireOrgAdminAccess`), template ownership pinned to the resolved org.
 * Coach ids in the body are validated as actual org coaching staff
 * (`isOrgCoachingStaff`) — an id that isn't gets a 422, never a silent
 * assignment to a non-coach account.
 */
import type { APIRoute } from "astro";
import { and, asc, eq, gt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { setCoachesFor, getCoachesFor } from "@/lib/coach/coaching-assignments";
import {
  templateCoachesBodySchema,
  firstInvalidCoachId,
  namedCoachIds,
  mapSetCoachesError,
} from "@/lib/classes/admin-staffing";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function loadOwnedTemplate(orgId: string, id: string) {
  const [row] = await getDb()
    .select({ id: classSlotTemplates.id })
    .from(classSlotTemplates)
    .where(and(eq(classSlotTemplates.id, id), eq(classSlotTemplates.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

async function futureScheduledSessionIds(templateId: string, now: Date): Promise<string[]> {
  const rows = await getDb()
    .select({ id: dropInSessions.id })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.classSlotTemplateId, templateId),
        eq(dropInSessions.status, "scheduled"),
        gt(dropInSessions.startsAt, now),
      ),
    );
  return rows.map((r) => r.id);
}

export const GET: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Template id required" }, 400);

  const template = await loadOwnedTemplate(orgId, id);
  if (!template) return json({ error: "Template not found" }, 404);

  const templateCoaches = await getCoachesFor("class_template", id);

  const now = new Date();
  const sessionRows = await getDb()
    .select({ id: dropInSessions.id, startsAt: dropInSessions.startsAt })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.classSlotTemplateId, id),
        eq(dropInSessions.status, "scheduled"),
        gt(dropInSessions.startsAt, now),
      ),
    )
    .orderBy(asc(dropInSessions.startsAt));

  const sessions = await Promise.all(
    sessionRows.map(async (session) => ({
      sessionId: session.id,
      startsAt: session.startsAt,
      coaches: await getCoachesFor("class_session", session.id),
    })),
  );

  return json({ templateCoaches, sessions }, 200);
};

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Template id required" }, 400);

  const template = await loadOwnedTemplate(orgId, id);
  if (!template) return json({ error: "Template not found" }, 404);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = templateCoachesBodySchema.safeParse(raw);
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
      kind: "class_template",
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

  let sessionsUpdated = 0;
  if (input.applyToMaterialized) {
    const sessionIds = await futureScheduledSessionIds(id, new Date());
    for (const sessionId of sessionIds) {
      // Ownership is already guaranteed (every session here was queried BY
      // this template's id, which was itself just pinned to orgId above), so
      // AssignmentTargetOrgMismatchError is not expected — isolate per-session
      // anyway rather than let one unexpected failure abort the whole batch,
      // matching the isolation pattern materializeClassSessions uses.
      try {
        await setCoachesFor({
          organizationId: orgId,
          kind: "class_session",
          targetId: sessionId,
          lead: input.lead,
          assistants: input.assistants,
          createdByUserId: auth.user.id,
        });
        sessionsUpdated += 1;
      } catch (err) {
        console.error(
          `[admin/classes] applyToMaterialized coach replace failed for session ${sessionId}:`,
          err,
        );
      }
    }
  }

  const templateCoaches = await getCoachesFor("class_template", id);
  return json({ templateCoaches, sessionsUpdated }, 200);
};
