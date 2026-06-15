// TODO(SP2b): location-scope write — POST does not yet verify session's venue.locationId ∈ caller's locations.
/**
 * POST /api/admin/dropin/sessions/:id/repeat
 *
 * Bulk-create N independent copies of a session, weekly, until a given
 * date (inclusive). Each copy is a standalone session — editing one
 * doesn't propagate to the others. This is the MVP "recurring" feature
 * per spec §10.6 (a proper recurring-template entity is deferred).
 *
 * Body:
 *   { untilDate: ISO-date }   // YYYY-MM-DD or full ISO string
 *
 * Returns the list of created session ids.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { syncDropInSessionBlock } from "@/lib/scheduling/sync";
import { BlockConflictError } from "@/lib/scheduling/blocks";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_COPIES = 26;

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  let body: { untilDate?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.untilDate) return json({ error: "untilDate required" }, 400);

  const until = new Date(body.untilDate);
  if (isNaN(until.getTime())) {
    return json({ error: "Invalid untilDate" }, 400);
  }

  const db = getDb();
  const [origin] = await db
    .select()
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, id),
        eq(dropInSessions.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!origin) return json({ error: "Session not found" }, 404);

  const originStart = new Date(origin.startsAt).getTime();
  const originEnd = new Date(origin.endsAt).getTime();
  const duration = originEnd - originStart;

  const newRows: typeof dropInSessions.$inferInsert[] = [];
  let week = 1;
  while (week <= MAX_COPIES) {
    const start = originStart + week * WEEK_MS;
    if (start > until.getTime()) break;
    newRows.push({
      organizationId: origin.organizationId,
      venueId: origin.venueId,
      bookableResourceId: origin.bookableResourceId,
      kind: origin.kind,
      sportOrClassLabel: origin.sportOrClassLabel,
      formatLabel: origin.formatLabel,
      startsAt: new Date(start),
      endsAt: new Date(start + duration),
      capacity: origin.capacity,
      capacityMale: origin.capacityMale,
      capacityFemale: origin.capacityFemale,
      skillLevel: origin.skillLevel,
      audience: origin.audience,
      membersOnly: origin.membersOnly,
      sessionRateCents: origin.sessionRateCents,
      memberRateCents: origin.memberRateCents,
      teamCount: origin.teamCount,
      teamColors: origin.teamColors,
      status: "scheduled",
      createdByUserId: auth.user.id,
    });
    week += 1;
  }

  if (newRows.length === 0) {
    return json(
      { error: "untilDate is before the first weekly repeat" },
      400,
    );
  }

  const created = await db
    .insert(dropInSessions)
    .values(newRows)
    .returning({ id: dropInSessions.id, startsAt: dropInSessions.startsAt });

  // Claim each repeat's slot in the field-time ledger. Conflicting weeks
  // are reported back (rows stay; the admin moves or cancels them) —
  // a holiday-week rental shouldn't abort the whole series.
  const conflicts: Array<{ id: string; warning: string }> = [];
  for (const row of created) {
    try {
      await syncDropInSessionBlock(row.id);
    } catch (err) {
      if (err instanceof BlockConflictError) {
        conflicts.push({ id: row.id, warning: err.message });
      } else {
        throw err;
      }
    }
  }

  return json(
    {
      ok: true,
      count: created.length,
      created,
      ...(conflicts.length > 0 ? { conflicts } : {}),
    },
    201,
  );
};
