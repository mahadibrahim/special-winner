import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";

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

export const POST: APIRoute = async ({ params, request, locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

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
