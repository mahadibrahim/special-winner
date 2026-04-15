import type { APIRoute } from "astro";
import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  conversations,
  conversationMessages,
  botActionsLog,
} from "@/lib/db/schema/conversations";
import { users } from "@/lib/db/schema/users";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { rosters } from "@/lib/db/schema/teams";
import { getCoachTeamIds } from "@/lib/auth/roles";

/**
 * GET /api/messaging/conversations/:id
 *
 * Returns a full conversation view with:
 *   - conversation metadata (assignment, channel history, etc.)
 *   - parent profile (name, email, phone, messaging preferences)
 *   - parent's kids and teams (for staff context panel)
 *   - all messages in the thread in chronological order
 *   - bot action log entries (reversible actions visible to admin)
 */
export const GET: APIRoute = async ({ params, locals }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const isAdmin = (locals as unknown as { isAdmin?: boolean }).isAdmin ?? false;
  const isCoach = (locals as unknown as { isCoach?: boolean }).isCoach ?? false;

  if (!isAdmin && !isCoach) {
    return json({ error: "Forbidden" }, 403);
  }

  const conversationId = params.id;
  if (!conversationId) {
    return json({ error: "Missing conversation id" }, 400);
  }

  const db = getDb();

  // Load the conversation
  const [conversation] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (!conversation) {
    return json({ error: "Conversation not found" }, 404);
  }

  // Coach scope check: coaches can only load conversations about parents
  // whose kids are on one of their teams.
  if (isCoach && !isAdmin) {
    const coachTeamIds = await getCoachTeamIds(user.id);

    if (coachTeamIds.length === 0) {
      return json({ error: "Forbidden" }, 403);
    }

    const parentScope = await db
      .select({ parentUserId: familyMembers.parentUserId })
      .from(rosters)
      .innerJoin(registrations, eq(registrations.id, rosters.registrationId))
      .innerJoin(
        familyMembers,
        eq(familyMembers.id, registrations.familyMemberId),
      )
      .where(
        and(
          inArray(rosters.teamId, coachTeamIds),
          eq(familyMembers.parentUserId, conversation.parentUserId),
        ),
      )
      .limit(1);

    if (parentScope.length === 0) {
      return json({ error: "Forbidden" }, 403);
    }
  }

  // Load parent profile
  const [parent] = await db
    .select({
      id: users.id,
      firstName: users.firstName,
      lastName: users.lastName,
      email: users.email,
      phone: users.phone,
      phoneVerified: users.phoneVerified,
      primaryChannel: users.messagingPrimaryChannel,
      fallbackChannel: users.messagingFallbackChannel,
    })
    .from(users)
    .where(eq(users.id, conversation.parentUserId))
    .limit(1);

  // Load parent's kids (with registration context for current teams)
  const kids = await db
    .select({
      id: familyMembers.id,
      firstName: familyMembers.firstName,
      lastName: familyMembers.lastName,
      birthDate: familyMembers.birthDate,
    })
    .from(familyMembers)
    .where(eq(familyMembers.parentUserId, conversation.parentUserId));

  // Load messages in chronological order
  const messages = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.conversationId, conversationId))
    .orderBy(asc(conversationMessages.createdAt));

  // Load bot actions for this conversation (for the actions log tab)
  const actions = await db
    .select()
    .from(botActionsLog)
    .where(eq(botActionsLog.conversationId, conversationId))
    .orderBy(asc(botActionsLog.createdAt));

  return json({
    conversation: {
      id: conversation.id,
      organizationId: conversation.organizationId,
      status: conversation.status,
      assignmentRole: conversation.assignmentRole,
      assignedStaffId: conversation.assignedStaffId,
      pendingConfirmation: conversation.pendingConfirmation,
      lastMessageAt: conversation.lastMessageAt.toISOString(),
      createdAt: conversation.createdAt.toISOString(),
    },
    parent: parent
      ? {
          id: parent.id,
          name: `${parent.firstName ?? ""} ${parent.lastName ?? ""}`.trim(),
          email: parent.email,
          phone: parent.phone,
          phoneVerified: parent.phoneVerified,
          primaryChannel: parent.primaryChannel,
          fallbackChannel: parent.fallbackChannel,
        }
      : null,
    kids: kids.map((k) => ({
      id: k.id,
      name: `${k.firstName} ${k.lastName}`,
      age: k.birthDate
        ? Math.floor(
            (Date.now() - new Date(k.birthDate).getTime()) /
              (365.25 * 24 * 60 * 60 * 1000),
          )
        : null,
    })),
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      channel: m.channel,
      senderType: m.senderType,
      senderUserId: m.senderUserId,
      body: m.body,
      intentClassification: m.intentClassification,
      createdAt: m.createdAt.toISOString(),
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
    })),
    botActions: actions.map((a) => ({
      id: a.id,
      actionType: a.actionType,
      success: a.success,
      reversible: a.reversible,
      reversedAt: a.reversedAt?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      errorMessage: a.errorMessage,
    })),
  });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
