import type { APIRoute } from "astro";
import { and, asc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { hostProfiles } from "@/lib/db/schema/hosts";
import { dropInSessions } from "@/lib/db/schema/drop-in";
import { requireOrgAdminAccess } from "@/lib/auth/roles";
import { removeHostFromSession } from "@/lib/dropin/host-assignment";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** PATCH /api/admin/hosts/:id — pause/revoke/reactivate a host. */
export const PATCH: APIRoute = async (context) => {
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json({ error: "id required" }, 400);

  let body: { status?: string };
  try {
    body = await context.request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }
  if (!["active", "paused", "revoked"].includes(body.status ?? "")) {
    return json({ error: "status must be active | paused | revoked" }, 400);
  }
  const status = body.status as "active" | "paused" | "revoked";

  const db = getDb();
  const [profile] = await db
    .select()
    .from(hostProfiles)
    .where(
      and(eq(hostProfiles.id, id), eq(hostProfiles.organizationId, auth.organizationId)),
    )
    .orderBy(asc(hostProfiles.createdAt))
    .limit(1);
  if (!profile) return json({ error: "Host not found" }, 404);

  await db
    .update(hostProfiles)
    .set({ status, updatedAt: new Date() })
    .where(eq(hostProfiles.id, id));

  // Leaving active status → strip future assignments (past games keep the
  // historical record).
  let unassignedSessions = 0;
  if (status !== "active") {
    const future = await db
      .select({ id: dropInSessions.id })
      .from(dropInSessions)
      .where(
        and(
          eq(dropInSessions.hostUserId, profile.userId),
          eq(dropInSessions.organizationId, auth.organizationId),
          eq(dropInSessions.status, "scheduled"),
          gte(dropInSessions.startsAt, new Date()),
        ),
      );
    for (const session of future) {
      await removeHostFromSession({ sessionId: session.id, reason: "host_revoked" });
      unassignedSessions++;
    }
  }
  return json({ ok: true, status, unassignedSessions }, 200);
};
