import type { APIContext } from "astro";
import { getDb } from "@/lib/db";
import { userRoles, roles } from "@/lib/db/schema";
import { shootSessions } from "@/lib/db/schema/media";
import { validateSession } from "@/lib/auth";
import { and, eq } from "drizzle-orm";

export async function requireMediaStaffAccess(context: APIContext): Promise<
  | { authorized: false; response: Response }
  | { authorized: true; userId: string }
> {
  const { user } = await validateSession(context);
  if (!user) {
    return {
      authorized: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
      }),
    };
  }
  const rows = await getDb()
    .select({ name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(userRoles.roleId, roles.id))
    .where(eq(userRoles.userId, user.id));
  const names = new Set(rows.map((r) => r.name));
  if (!names.has("media_staff") && !names.has("super_admin")) {
    return {
      authorized: false,
      response: new Response(
        JSON.stringify({ error: "Forbidden: media_staff role required" }),
        { status: 403 }
      ),
    };
  }
  return { authorized: true, userId: user.id };
}

/**
 * Returns the session if the user is the assigned photographer OR is an admin.
 * Otherwise returns null. Admin check is left to the caller via requireAdminAccess;
 * this helper is used by photographer routes only.
 */
export async function loadAssignedSession(
  userId: string,
  sessionId: string
): Promise<{ id: string; status: string; assignedUserId: string | null } | null> {
  const [row] = await getDb()
    .select({
      id: shootSessions.id,
      status: shootSessions.status,
      assignedUserId: shootSessions.assignedUserId,
    })
    .from(shootSessions)
    .where(
      and(
        eq(shootSessions.id, sessionId),
        eq(shootSessions.assignedUserId, userId)
      )
    )
    .limit(1);
  return row ?? null;
}
