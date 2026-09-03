/**
 * PUT /api/admin/classes/templates/:id → edit a class-slot template.
 *
 * Two edge cases layered on top of a plain field update:
 *   - Deactivation with teeth: `{ active: false, cancelFutureSessions: true }`
 *     cancels every future `scheduled` session materialized from this
 *     template (refunding active bookings via the same pipeline the admin
 *     drop-in session cancel endpoint uses) and reports the counts.
 *   - Schedule-change notice: changing `weekday` or `startTime` while the
 *     template has active enrollments emails each enrolled family, awaited
 *     after the update commits, failures logged not thrown.
 *   - Rate propagation: changing `sessionRateDollars`/`memberRateDollars`
 *     rewrites the same rates onto every FUTURE `scheduled` session already
 *     materialized from this template (`sessionsRepriced` in the response),
 *     because the door quotes the template but the charge paths price off the
 *     session's copied rate.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { classSlotTemplates } from "@/lib/db/schema/classes";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { requireSameOrgVenue } from "@/lib/auth/require-resource-ownership";
import { dollarsToCents } from "@/lib/memberships/tier-units";
import {
  templateUpdateSchema,
  normalizeStartTime,
  cancelFutureTemplateSessions,
  notifyFamiliesOfScheduleChange,
  propagateTemplateRatesToFutureSessions,
} from "@/lib/classes/admin-templates";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

async function loadOwned(orgId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(classSlotTemplates)
    .where(and(eq(classSlotTemplates.id, id), eq(classSlotTemplates.organizationId, orgId)))
    .limit(1);
  return row ?? null;
}

export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "Template id required" }, 400);

  const existing = await loadOwned(orgId, id);
  if (!existing) return json({ error: "Template not found" }, 404);

  let raw: unknown;
  try {
    raw = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  const parsed = templateUpdateSchema.safeParse(raw);
  if (!parsed.success) return json({ error: "Validation failed", details: parsed.error.flatten() }, 422);
  const input = parsed.data;

  const venueCheck = await requireSameOrgVenue(orgId, input.venueId);
  if (!venueCheck.ok) return json({ error: "Venue not found" }, 404);

  const scheduleChanged =
    input.weekday !== existing.weekday ||
    normalizeStartTime(input.startTime) !== normalizeStartTime(existing.startTime);

  // Compared BEFORE the update, against the row as it stood on entry — after
  // the UPDATE below there is no old value left to diff against.
  const nextSessionRateCents = dollarsToCents(input.sessionRateDollars);
  const nextMemberRateCents = dollarsToCents(input.memberRateDollars);
  const ratesChanged =
    nextSessionRateCents !== existing.sessionRateCents ||
    nextMemberRateCents !== existing.memberRateCents;

  const db = getDb();
  const [template] = await db
    .update(classSlotTemplates)
    .set({
      name: input.name,
      venueId: input.venueId,
      sportLabel: input.sportLabel,
      minAge: input.minAge,
      maxAge: input.maxAge,
      weekday: input.weekday,
      startTime: input.startTime,
      durationMins: input.durationMins,
      capacity: input.capacity,
      sessionRateCents: nextSessionRateCents,
      memberRateCents: nextMemberRateCents,
      blockRateCents: dollarsToCents(input.blockRateDollars),
      active: input.active,
      isTechnical: input.isTechnical,
      updatedAt: new Date(),
    })
    .where(eq(classSlotTemplates.id, existing.id))
    .returning();

  // Both side effects below run AFTER the update above has committed
  // (autocommit — no shared transaction), and never throw: a messaging or
  // cancellation-reporting hiccup must never make an otherwise-successful
  // edit look like it failed.

  // Rate edits must reach the sessions already materialized from this
  // template: the drop-in door quotes the TEMPLATE's rate, but the charge
  // paths price off the SESSION's copied rate, so without this the two
  // disagree for up to HORIZON_DAYS. See
  // propagateTemplateRatesToFutureSessions for the full rationale (and why
  // past/started sessions are deliberately left alone).
  let sessionsRepriced = 0;
  if (ratesChanged) {
    sessionsRepriced = await propagateTemplateRatesToFutureSessions(existing.id, {
      sessionRateCents: nextSessionRateCents,
      memberRateCents: nextMemberRateCents,
    });
  }

  let familiesNotified = 0;
  if (scheduleChanged) {
    familiesNotified = await notifyFamiliesOfScheduleChange({
      templateId: existing.id,
      templateName: template.name,
      oldWeekday: existing.weekday,
      oldStartTime: existing.startTime,
      newWeekday: input.weekday,
      newStartTime: input.startTime,
    });
  }

  let cancellation: { sessionsCancelled: number; bookingsRefunded: number } | null = null;
  if (input.active === false && input.cancelFutureSessions === true) {
    cancellation = await cancelFutureTemplateSessions(existing.id);
  }

  return json(
    {
      template,
      familiesNotified,
      sessionsRepriced,
      ...(cancellation ?? {}),
    },
    200,
  );
};
