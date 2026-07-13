import type { APIRoute } from "astro";
import { requireActiveHost } from "@/lib/auth/host";
import { assignHostToSession } from "@/lib/dropin/host-assignment";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { dropInSessions } from "@/lib/db/schema/drop-in";

export const prerender = false;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

/** POST /api/host/games/:id/claim — self-claim an unhosted pickup game. */
export const POST: APIRoute = async (context) => {
  const auth = await requireActiveHost(context);
  if (!auth.authorized) return auth.response;

  const id = context.params.id;
  if (!id) return json({ error: "session id required" }, 400);

  // Org pin BEFORE assign — a foreign-org session must read as 404, and
  // assignHostToSession alone would leak "not_active_host" instead.
  const [session] = await getDb()
    .select({ id: dropInSessions.id, kind: dropInSessions.kind })
    .from(dropInSessions)
    .where(
      and(eq(dropInSessions.id, id), eq(dropInSessions.organizationId, auth.organizationId)),
    )
    .limit(1);
  if (!session) return json({ error: "Session not found" }, 404);
  if (session.kind !== "pickup") return json({ error: "Only pickup games can be claimed" }, 400);

  const result = await assignHostToSession({ sessionId: id, hostUserId: auth.userId });
  if (!result.ok) {
    const status =
      result.code === "already_hosted" ? 409 :
      result.code === "session_not_found" ? 404 : 400;
    return json({ error: result.message, code: result.code }, status);
  }
  return json({ ok: true }, 200);
};
