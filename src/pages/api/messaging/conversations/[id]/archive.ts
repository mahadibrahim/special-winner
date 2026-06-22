import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";
import { requireOrgAdminAccess } from "@/lib/auth/roles";

/**
 * POST /api/messaging/conversations/:id/archive
 *
 * Archive a conversation. Archived conversations are excluded from the
 * default staff inbox view but are still searchable. Archiving does not
 * delete data.
 */

export const POST: APIRoute = async (context) => {
  const { params } = context;

  // Staff-only management action. Require an admin OF THIS ORG, then pin the
  // conversation to that org. The original bare `locals.user` check let any
  // authenticated user archive any org's conversation (hiding active threads
  // from staff org-wide); requireOrgAdminAccess also blocks an admin of a
  // different org.
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const conversationId = params.id;
  if (!conversationId) {
    return json({ error: "Missing conversation id" }, 400);
  }

  const db = getDb();
  const [conversation] = await db
    .select({
      id: conversations.id,
      organizationId: conversations.organizationId,
    })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation || conversation.organizationId !== auth.organizationId) {
    return json({ error: "Conversation not found" }, 404);
  }

  await db
    .update(conversations)
    .set({ status: "archived", updatedAt: new Date() })
    .where(eq(conversations.id, conversationId));

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
