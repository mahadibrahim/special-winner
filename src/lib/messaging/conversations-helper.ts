import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { conversations } from "@/lib/db/schema/conversations";

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
