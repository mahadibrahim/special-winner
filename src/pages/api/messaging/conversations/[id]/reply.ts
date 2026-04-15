import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";
import { sendToParent } from "@/lib/messaging/gateway";

/**
 * POST /api/messaging/conversations/:id/reply
 *
 * Staff reply to a conversation. The message is sent via the outbound
 * gateway, which picks the parent's preferred channel and records the
 * outbound message on the conversation_messages table.
 *
 * Body:
 *   - body: string (required)
 *   - forceChannel?: 'sms' | 'email' | 'telegram' (optional override)
 */

const replySchema = z.object({
  body: z.string().min(1, "Reply body is required").max(4000),
  forceChannel: z.enum(["sms", "email", "telegram"]).optional(),
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

  const parsed = replySchema.safeParse(payload);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0].message }, 400);
  }

  const db = getDb();
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return json({ error: "Conversation not found" }, 404);
  }

  // Determine sender type based on the staff user's role.
  // For now, assume admin — a full role check can be added when the coach
  // inbox view is live and we need to distinguish coach vs admin replies.
  const senderType = "admin" as const;

  const result = await sendToParent({
    parentUserId: conversation.parentUserId,
    organizationId: conversation.organizationId,
    body: parsed.data.body,
    forceChannel: parsed.data.forceChannel,
    conversationId,
    senderType,
    senderUserId: user.id,
  });

  if (!result.ok) {
    return json(
      {
        error: "Failed to send reply",
        reason: result.reason,
        details: result.error,
      },
      502,
    );
  }

  return json({
    success: true,
    messageId: result.messageId,
    channel: result.channel,
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
