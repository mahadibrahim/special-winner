import { sql, and, eq, isNull, gt, isNotNull, or } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { registrations } from "@/lib/db/schema/registrations";
import { seasons, programs } from "@/lib/db/schema/programs";
import { locations } from "@/lib/db/schema/organizations";
import { conversations } from "@/lib/db/schema/conversations";
import { getAttentionFeed } from "@/lib/admin/attention-feed";

export type NavBadges = {
  inbox: number;
  refundsPending: number;
  attention: number;
};

/**
 * Counts for the admin sidebar notification badges. Each is org-scoped and
 * cheap. Callers must fail-soft: a thrown error should degrade to no badges,
 * not a broken layout (the API route swallows errors).
 */
export async function getNavBadges(orgId: string): Promise<NavBadges> {
  const db = getDb();

  // Pending refund requests (same scoping as the attention feed's refund item).
  const [refundRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(
      and(
        eq(registrations.refundStatus, "pending_approval"),
        eq(locations.organizationId, orgId),
      ),
    );

  // Conversations with an unread inbound message (no later outbound).
  const [inboxRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(
      and(
        eq(conversations.organizationId, orgId),
        isNotNull(conversations.lastInboundAt),
        or(
          isNull(conversations.lastOutboundAt),
          gt(conversations.lastInboundAt, conversations.lastOutboundAt),
        ),
      ),
    );

  const attention = (await getAttentionFeed(orgId)).length;

  return {
    refundsPending: refundRow?.count ?? 0,
    inbox: inboxRow?.count ?? 0,
    attention,
  };
}
