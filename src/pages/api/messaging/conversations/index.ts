import type { APIRoute } from "astro";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  conversations,
  conversationMessages,
} from "@/lib/db/schema/conversations";
import { users } from "@/lib/db/schema/users";
import { rosters } from "@/lib/db/schema/teams";
import { registrations, familyMembers } from "@/lib/db/schema/registrations";
import { getCoachTeamIds } from "@/lib/auth/roles";

/**
 * GET /api/messaging/conversations
 *
 * Lists conversations visible to the current staff user (admin or coach).
 *
 * Query params:
 *   - filter: 'mine' | 'unassigned' | 'all' (default 'all')
 *   - assignment: 'bot' | 'coach' | 'admin' (filter by role)
 *   - status: 'active' | 'archived' | 'muted' (default 'active')
 *   - limit: number (default 20, max 100)
 *   - offset: number (default 0)
 *
 * Returns an array of conversation summaries, each with:
 *   - id, parentName, parentUserId, lastMessageAt, assignmentRole,
 *     assignedStaffId, snippet (last message body), unreadInbound (bool)
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const user = locals.user;
  if (!user) {
    return json({ error: "Unauthorized" }, 401);
  }

  // Role context — admins see every conversation, coaches are scoped to
  // conversations about kids on their teams.
  const isAdmin = (locals as unknown as { isAdmin?: boolean }).isAdmin ?? false;
  const isCoach = (locals as unknown as { isCoach?: boolean }).isCoach ?? false;

  if (!isAdmin && !isCoach) {
    return json({ error: "Forbidden" }, 403);
  }

  const params = url.searchParams;
  const filter = params.get("filter") || "all";
  const assignment = params.get("assignment");
  const status = params.get("status") || "active";
  const limit = Math.min(parseInt(params.get("limit") || "20", 10), 100);
  const offset = parseInt(params.get("offset") || "0", 10);

  const db = getDb();

  const conditions = [eq(conversations.status, status)];

  if (assignment) {
    conditions.push(eq(conversations.assignmentRole, assignment));
  }

  if (filter === "mine") {
    conditions.push(eq(conversations.assignedStaffId, user.id));
  } else if (filter === "unassigned") {
    conditions.push(isNull(conversations.assignedStaffId));
  }

  // Coach scoping: restrict to parents whose kids are on this coach's teams.
  // Admins are not restricted. If a user is both admin and coach, admin
  // privileges win and they see everything.
  if (isCoach && !isAdmin) {
    const coachTeamIds = await getCoachTeamIds(user.id);

    if (coachTeamIds.length === 0) {
      // Coach is not assigned to any team — show no conversations to avoid
      // accidentally surfacing other coaches' threads.
      return json({ conversations: [], total: 0 });
    }

    // Find parents of every kid on any of the coach's teams
    const parentRows = await db
      .selectDistinct({ parentUserId: familyMembers.parentUserId })
      .from(rosters)
      .innerJoin(
        registrations,
        eq(registrations.id, rosters.registrationId),
      )
      .innerJoin(
        familyMembers,
        eq(familyMembers.id, registrations.familyMemberId),
      )
      .where(inArray(rosters.teamId, coachTeamIds));

    const allowedParentIds = parentRows.map((r) => r.parentUserId);

    if (allowedParentIds.length === 0) {
      return json({ conversations: [], total: 0 });
    }

    conditions.push(inArray(conversations.parentUserId, allowedParentIds));
  }

  const rows = await db
    .select({
      id: conversations.id,
      organizationId: conversations.organizationId,
      parentUserId: conversations.parentUserId,
      parentFirstName: users.firstName,
      parentLastName: users.lastName,
      parentEmail: users.email,
      parentPhone: users.phone,
      assignmentRole: conversations.assignmentRole,
      assignedStaffId: conversations.assignedStaffId,
      lastMessageAt: conversations.lastMessageAt,
      lastInboundAt: conversations.lastInboundAt,
      lastOutboundAt: conversations.lastOutboundAt,
    })
    .from(conversations)
    .innerJoin(users, eq(users.id, conversations.parentUserId))
    .where(and(...conditions))
    .orderBy(desc(conversations.lastMessageAt))
    .limit(limit)
    .offset(offset);

  // For each conversation, fetch the most recent message snippet
  const conversationIds = rows.map((r) => r.id);
  const snippets = new Map<
    string,
    { body: string; direction: string; channel: string }
  >();

  if (conversationIds.length > 0) {
    const recent = await db
      .select({
        conversationId: conversationMessages.conversationId,
        body: conversationMessages.body,
        direction: conversationMessages.direction,
        channel: conversationMessages.channel,
        createdAt: conversationMessages.createdAt,
      })
      .from(conversationMessages)
      .where(
        or(
          ...conversationIds.map((id) =>
            eq(conversationMessages.conversationId, id),
          ),
        ),
      )
      .orderBy(desc(conversationMessages.createdAt));

    // Take the newest per conversation
    for (const m of recent) {
      if (!snippets.has(m.conversationId)) {
        snippets.set(m.conversationId, {
          body: m.body.length > 140 ? m.body.slice(0, 137) + "…" : m.body,
          direction: m.direction,
          channel: m.channel,
        });
      }
    }
  }

  const result = rows.map((r) => {
    const snippet = snippets.get(r.id);
    const unreadInbound = Boolean(
      r.lastInboundAt &&
        (!r.lastOutboundAt || r.lastInboundAt > r.lastOutboundAt),
    );
    return {
      id: r.id,
      parentName:
        `${r.parentFirstName ?? ""} ${r.parentLastName ?? ""}`.trim() ||
        r.parentEmail,
      parentUserId: r.parentUserId,
      parentEmail: r.parentEmail,
      parentPhone: r.parentPhone,
      assignmentRole: r.assignmentRole,
      assignedStaffId: r.assignedStaffId,
      lastMessageAt: r.lastMessageAt.toISOString(),
      snippet: snippet?.body ?? "",
      lastChannel: snippet?.channel ?? null,
      lastDirection: snippet?.direction ?? null,
      unreadInbound,
    };
  });

  return json({ conversations: result, total: result.length });
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
