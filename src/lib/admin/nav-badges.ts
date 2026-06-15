import { sql, and, eq, isNull, gt, isNotNull, or, inArray } from "drizzle-orm";
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

export type NavBadgeScope = { locationIds: string[]; userId: string };

/**
 * Sidebar badge counts.
 * - No scope (super-admin): org-wide counts + attention feed length.
 * - Scope (venue manager): refunds limited to scope.locationIds; inbox limited
 *   to conversations assigned to scope.userId; attention is 0 (the attention
 *   feed is a super-admin cross-org view, not shown on the venue Home).
 * Callers must fail-soft (the API route swallows errors).
 */
export async function getNavBadges(orgId: string, scope?: NavBadgeScope): Promise<NavBadges> {
  const db = getDb();

  // --- refundsPending ---
  const refundWhere = scope
    ? and(
        eq(registrations.refundStatus, "pending_approval"),
        eq(locations.organizationId, orgId),
        scope.locationIds.length > 0
          ? inArray(locations.id, scope.locationIds)
          : sql`false`, // no locations → no rows
      )
    : and(
        eq(registrations.refundStatus, "pending_approval"),
        eq(locations.organizationId, orgId),
      );

  const [refundRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(registrations)
    .innerJoin(seasons, eq(registrations.seasonId, seasons.id))
    .innerJoin(programs, eq(seasons.programId, programs.id))
    .innerJoin(locations, eq(programs.locationId, locations.id))
    .where(refundWhere);

  // --- inbox ---
  const unread = or(
    isNull(conversations.lastOutboundAt),
    gt(conversations.lastInboundAt, conversations.lastOutboundAt),
  );
  const inboxWhere = scope
    ? and(
        eq(conversations.organizationId, orgId),
        eq(conversations.assignedStaffId, scope.userId),
        isNotNull(conversations.lastInboundAt),
        unread,
      )
    : and(eq(conversations.organizationId, orgId), isNotNull(conversations.lastInboundAt), unread);

  const [inboxRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(conversations)
    .where(inboxWhere);

  const attention = scope ? 0 : (await getAttentionFeed(orgId)).length;

  return {
    refundsPending: refundRow?.count ?? 0,
    inbox: inboxRow?.count ?? 0,
    attention,
  };
}
