import type { APIRoute } from "astro";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";
import { sendToParent } from "@/lib/messaging/gateway";
import {
  getUserRoles,
  getCoachTeamIds,
  requireOrganizationContext,
} from "@/lib/auth";

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

export const POST: APIRoute = async (context) => {
  const { params, request, locals } = context;
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

  // Resolve caller's role/scope and confirm authorization to reply on this
  // conversation's organization. Plain `locals.user` is not enough: it would
  // let any logged-in parent post into staff-only conversations as 'admin'.
  const orgContext = await requireOrganizationContext(context);
  if (!orgContext.hasOrganization) return orgContext.response;

  // Pin to the resolved org-context: the conversation must belong to the
  // organization the request is being made against.
  if (conversation.organizationId !== orgContext.organizationId) {
    return json({ error: "Forbidden" }, 403);
  }

  const userRoles = await getUserRoles(user.id);
  const isAdmin = userRoles.some(
    (r) => r.name === "super_admin" || r.name === "location_admin",
  );

  let senderType: "admin" | "coach";
  if (isAdmin) {
    senderType = "admin";
  } else {
    // Allow a coach to reply only if they coach a team in this org. We don't
    // currently scope conversations to a specific team, so coach access is
    // treated as "coach for this org".
    const coachTeamIds = await getCoachTeamIds(user.id);
    if (coachTeamIds.length === 0) {
      return json({ error: "Forbidden" }, 403);
    }
    senderType = "coach";
  }

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
