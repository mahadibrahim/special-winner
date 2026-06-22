import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";
import { requireOrgAdminAccess } from "@/lib/auth/roles";

/**
 * POST /api/messaging/conversations/:id/assign
 *
 * Reassign a conversation to a different staff member, or clear the assignment.
 *
 * Body:
 *   - staffId: string | null — user id to assign, or null to unassign
 *   - role: 'bot' | 'coach' | 'admin' — the assignment role
 */

const assignSchema = z.object({
  staffId: z.string().uuid().nullable(),
  role: z.enum(["bot", "coach", "admin"]),
});

export const POST: APIRoute = async (context) => {
  const { params, request } = context;

  // Staff-only management action. Require an admin OF THIS ORG, then pin the
  // conversation to that org. A bare `locals.user` check (the original
  // behaviour) let any authenticated user — even a parent — reassign any org's
  // conversation; a global admin check would let an admin of another org do
  // the same. requireOrgAdminAccess closes both.
  const auth = await requireOrgAdminAccess(context);
  if (!auth.authorized) return auth.response;

  const conversationId = params.id;
  if (!conversationId) {
    return json({ error: "Missing conversation id" }, 400);
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const parsed = assignSchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
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

  // 404 (not 403) on a cross-org or missing id so we don't disclose the
  // existence of another tenant's conversation.
  if (!conversation || conversation.organizationId !== auth.organizationId) {
    return json({ error: "Conversation not found" }, 404);
  }

  await db
    .update(conversations)
    .set({
      assignedStaffId: parsed.data.staffId,
      assignmentRole: parsed.data.role,
      updatedAt: new Date(),
    })
    .where(eq(conversations.id, conversationId));

  return json({ success: true });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
