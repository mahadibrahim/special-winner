import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";
import { validateSession } from "@/lib/auth/session";
import { canTagSession } from "@/lib/media/tag-permissions";
import { logMediaAction } from "@/lib/media/audit";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const { user } = await validateSession(context);
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }
  const sessionId = context.params.session_id;
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing session_id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }
  const perm = await canTagSession(user.id, sessionId);
  if (!perm.allowed) {
    return new Response(JSON.stringify({ error: perm.reason }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();
  const updated = await db
    .update(shootSessions)
    .set({ status: "ready", updatedAt: new Date() })
    .where(
      and(eq(shootSessions.id, sessionId), eq(shootSessions.status, "tagging"))
    )
    .returning();
  if (updated.length === 0) {
    return new Response(
      JSON.stringify({ error: "Session not in 'tagging' state" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  await logMediaAction({
    actorUserId: user.id,
    entityType: "session",
    entityId: sessionId,
    action: "update",
    diff: { status: { from: "tagging", to: "ready" } },
  });

  return new Response(JSON.stringify({ session: updated[0] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
