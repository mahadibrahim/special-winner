import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";

/**
 * Batch version of resolveOrCreateConversation for fan-out paths
 * (broadcasts): one SELECT for all existing active conversations plus one
 * multi-row INSERT for the missing ones, instead of 1-2 queries per
 * recipient. Returns parentUserId → conversationId.
 */
export async function resolveOrCreateConversations(
  parentUserIds: string[],
  organizationId: string,
): Promise<Map<string, string>> {
  const byUser = new Map<string, string>();
  const uniqueIds = [...new Set(parentUserIds)];
  if (uniqueIds.length === 0) return byUser;

  const db = getDb();

  const existing = await db
    .select({ id: conversations.id, parentUserId: conversations.parentUserId })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        inArray(conversations.parentUserId, uniqueIds),
        eq(conversations.status, "active"),
      ),
    );
  for (const row of existing) {
    // Multiple active conversations per parent shouldn't exist; first wins
    // (matches the .limit(1) in the single-row helper).
    if (!byUser.has(row.parentUserId)) {
      byUser.set(row.parentUserId, row.id);
    }
  }

  const missing = uniqueIds.filter((id) => !byUser.has(id));
  if (missing.length > 0) {
    const created = await db
      .insert(conversations)
      .values(
        missing.map((parentUserId) => ({
          organizationId,
          parentUserId,
          status: "active" as const,
          assignmentRole: "bot" as const,
        })),
      )
      .returning({ id: conversations.id, parentUserId: conversations.parentUserId });
    for (const row of created) {
      byUser.set(row.parentUserId, row.id);
    }
  }

  return byUser;
}

/**
 * Resolve an existing active conversation for the parent, or create a new one.
 * Required because conversationMessages.conversationId is NOT NULL.
 */
export async function resolveOrCreateConversation(
  parentUserId: string,
  organizationId: string,
  existingId?: string,
): Promise<string> {
  const db = getDb();

  if (existingId) return existingId;

  const existing = await db
    .select({ id: conversations.id })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, organizationId),
        eq(conversations.parentUserId, parentUserId),
        eq(conversations.status, "active"),
      ),
    )
    .limit(1);

  if (existing.length > 0) return existing[0].id;

  // Create a new conversation
  const [row] = await db
    .insert(conversations)
    .values({
      organizationId,
      parentUserId,
      status: "active",
      assignmentRole: "bot",
    })
    .returning({ id: conversations.id });

  return row.id;
}
