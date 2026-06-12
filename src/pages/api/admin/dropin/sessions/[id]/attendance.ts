/**
 * POST /api/admin/dropin/sessions/:id/attendance
 *
 * Bulk update attendance for a session. Body:
 *   {
 *     entries: Array<{
 *       bookingId: string;
 *       action: "check_in" | "no_show" | "undo_check_in";
 *     }>;
 *   }
 *
 * Tenant-scoped.
 */
import type { APIRoute } from "astro";
import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInBookings, dropInSessions } from "@/lib/db/schema/drop-in";
import { requireAdminAccess } from "@/lib/auth/roles";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

interface Entry {
  bookingId: string;
  action: "check_in" | "no_show" | "undo_check_in";
}

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = context.locals.organization?.id;
  if (!orgId) return json({ error: "No organization context" }, 400);

  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  let body: { entries?: Entry[] };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.entries || !Array.isArray(body.entries)) {
    return json({ error: "entries[] required" }, 400);
  }

  const db = getDb();

  // Tenant guard: session must be ours.
  const [session] = await db
    .select({ id: dropInSessions.id })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, id),
        eq(dropInSessions.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);

  // Pull only bookings belonging to this session — guards against
  // cross-session id passing.
  const ids = body.entries.map((e) => e.bookingId);
  if (ids.length === 0) return json({ ok: true, updated: 0 }, 200);

  const ours = await db
    .select({ id: dropInBookings.id })
    .from(dropInBookings)
    .where(
      and(
        eq(dropInBookings.sessionId, id),
        inArray(dropInBookings.id, ids),
      ),
    );
  const ourIds = new Set(ours.map((r) => r.id));

  // One UPDATE per action type instead of one per entry. If the same
  // booking appears twice, the last entry wins (same outcome as the
  // sequential loop this replaces).
  const actionById = new Map<string, Entry["action"]>();
  for (const entry of body.entries) {
    if (!ourIds.has(entry.bookingId)) continue;
    actionById.set(entry.bookingId, entry.action);
  }

  const idsFor = (action: Entry["action"]) =>
    [...actionById.entries()].filter(([, a]) => a === action).map(([id]) => id);

  const checkInIds = idsFor("check_in");
  const undoIds = idsFor("undo_check_in");
  const noShowIds = idsFor("no_show");
  const now = new Date();

  if (checkInIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({ checkedInAt: now, updatedAt: now })
      .where(inArray(dropInBookings.id, checkInIds));
  }
  if (undoIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({ checkedInAt: null, updatedAt: now })
      .where(inArray(dropInBookings.id, undoIds));
  }
  if (noShowIds.length > 0) {
    await db
      .update(dropInBookings)
      .set({
        status: "no_show",
        cancellationReason: "no_show",
        cancelledAt: now,
        updatedAt: now,
      })
      .where(inArray(dropInBookings.id, noShowIds));
  }

  const updated = actionById.size;

  return json({ ok: true, updated }, 200);
};
