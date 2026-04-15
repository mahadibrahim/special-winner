import type { APIRoute } from "astro";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";

/**
 * POST /api/messaging/conversations/:id/archive
 *
 * Archive a conversation. Archived conversations are excluded from the
 * default staff inbox view but are still searchable. Archiving does not
 * delete data.
 */

export const POST: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const conversationId = params.id;
  if (!conversationId) {
    return json({ error: "Missing conversation id" }, 400);
  }

  const db = getDb();
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
