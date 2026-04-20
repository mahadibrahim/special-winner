import type { APIRoute } from "astro";
import { getDb } from "@/lib/db";
import { shootSessions } from "@/lib/db/schema/media";
import { and, eq } from "drizzle-orm";
import { requireAdminAccess, requireOrganizationContext } from "@/lib/auth";
import { logMediaAction } from "@/lib/media/audit";

export const prerender = false;

export const POST: APIRoute = async (context) => {
  const auth = await requireAdminAccess(context);
  if (!auth.authorized) return auth.response;
  const orgCtx = await requireOrganizationContext(context);
  if (!orgCtx.hasOrganization) return orgCtx.response;

  const sessionId = context.params.id;
  if (!sessionId) {
    return new Response(JSON.stringify({ error: "Missing id" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const db = getDb();

  const updated = await db
    .update(shootSessions)
    .set({ status: "tagging", updatedAt: new Date() })
    .where(
      and(
        eq(shootSessions.id, sessionId),
        eq(shootSessions.organizationId, orgCtx.organizationId),
        eq(shootSessions.status, "uploaded")
      )
    )
    .returning();

  if (updated.length === 0) {
    const existing = await db.query.shootSessions.findFirst({
      where: and(
        eq(shootSessions.id, sessionId),
        eq(shootSessions.organizationId, orgCtx.organizationId)
      ),
    });
    if (!existing) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(
      JSON.stringify({
        error: "Session is not in 'uploaded' state",
        status: existing.status,
      }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    );
  }

  await logMediaAction({
    actorUserId: auth.user.id,
    entityType: "session",
    entityId: sessionId,
    action: "update",
    diff: { status: { from: "uploaded", to: "tagging" } },
  });

  return new Response(JSON.stringify({ session: updated[0] }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
