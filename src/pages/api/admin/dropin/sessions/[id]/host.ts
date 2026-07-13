/**
 * PUT/DELETE /api/admin/dropin/sessions/:id/host
 *
 * Assign or remove the community host on a drop-in session. Org- AND
 * location-scoped, same convention as cancel.ts: a venue manager can only
 * act on sessions whose venue is in their assigned locations (super-admin
 * is unscoped). All hostUserId writes go through
 * src/lib/dropin/host-assignment.ts — the only writers of the column.
 */
import type { APIRoute } from "astro";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { callerCanActOnVenue } from "@/lib/admin/require-location-scope";
import {
  assignHostToSession,
  removeHostFromSession,
} from "@/lib/dropin/host-assignment";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** Tenant + location guard shared by PUT and DELETE. */
async function guardSession(
  context: Parameters<APIRoute>[0],
  orgId: string,
): Promise<{ error: Response } | { id: string }> {
  const id = context.params.id;
  if (!id) return { error: json({ error: "session id required" }, 400) };
  const [session] = await getDb()
    .select({ id: dropInSessions.id, venueId: dropInSessions.venueId })
    .from(dropInSessions)
    .where(and(eq(dropInSessions.id, id), eq(dropInSessions.organizationId, orgId)))
    .limit(1);
  if (!session) return { error: json({ error: "Session not found" }, 404) };
  if (!(await callerCanActOnVenue(context, session.venueId))) {
    return { error: json({ error: "Session not found" }, 404) };
  }
  return { id };
}

// PUT /api/admin/dropin/sessions/:id/host  { hostUserId, replace? }
export const PUT: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const guard = await guardSession(context, auth.organizationId);
  if ("error" in guard) return guard.error;

  let body: { hostUserId?: string; replace?: boolean };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!body.hostUserId) return json({ error: "hostUserId required" }, 400);

  const result = await assignHostToSession({
    sessionId: guard.id,
    hostUserId: body.hostUserId,
    allowReplace: body.replace === true,
  });
  if (!result.ok) {
    const status =
      result.code === "already_hosted" ? 409 :
      result.code === "session_not_found" ? 404 : 400;
    return json({ error: result.message, code: result.code }, status);
  }
  return json({ ok: true, compBookingId: result.compBookingId }, 200);
};

// DELETE /api/admin/dropin/sessions/:id/host
export const DELETE: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const guard = await guardSession(context, auth.organizationId);
  if ("error" in guard) return guard.error;

  const result = await removeHostFromSession({
    sessionId: guard.id,
    reason: "admin_removed",
  });
  return json({ ok: true, removedHostUserId: result.removedHostUserId }, 200);
};
