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
 * Org- AND location-scoped: a venue manager can only mark attendance on
 * sessions whose venue is in their assigned locations (super-admin unscoped).
 * The bulk update itself lives in src/lib/dropin/attendance.ts, shared with
 * the host game-day attendance endpoint.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import { applyAttendanceEntries, type AttendanceEntry } from "@/lib/dropin/attendance";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

export const POST: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgId = auth.organizationId;

  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  let body: { entries?: AttendanceEntry[] };
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
    .select({ id: dropInSessions.id, venueId: dropInSessions.venueId })
    .from(dropInSessions)
    .where(
      and(
        eq(dropInSessions.id, id),
        eq(dropInSessions.organizationId, orgId),
      ),
    )
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);
  if (!(await callerCanActOnVenue(context, session.venueId))) {
    return json({ error: "Session not found" }, 404);
  }

  const { updated } = await applyAttendanceEntries(id, body.entries);
  return json({ ok: true, updated }, 200);
};
