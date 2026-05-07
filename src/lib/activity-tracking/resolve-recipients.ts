/**
 * Recipient resolution — given a venue + role, returns the users currently
 * assigned to that (venue, role) tuple.
 *
 * Uses `venue_role_assignments`, which is multi-tenant scoped via its own
 * `organization_id` column. We don't filter by org here because each
 * (venueId, roleId) pair already disambiguates org (venues belong to one
 * location belongs to one org).
 *
 * Effective-window semantics:
 *   effective_from <= at    AND    (effective_to IS NULL OR effective_to > at)
 *
 * Returns the user's contact channels so the dispatcher can pick a
 * delivery medium without a follow-up query.
 */
import { getDb } from "@/lib/db";
import { venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { users } from "@/lib/db/schema/users";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";

export interface Recipient {
  id: string;
  email: string | null;
  phone: string | null;
  telegramChatId: string | null;
  messagingPrimaryChannel: string | null;
  messagingFallbackChannel: string | null;
}

export async function resolveRecipientsForRole(
  venueId: string,
  roleId: string,
  at: Date = new Date(),
): Promise<Recipient[]> {
  const db = getDb();

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      phone: users.phone,
      telegramChatId: users.telegramChatId,
      messagingPrimaryChannel: users.messagingPrimaryChannel,
      messagingFallbackChannel: users.messagingFallbackChannel,
    })
    .from(venueRoleAssignments)
    .innerJoin(users, eq(venueRoleAssignments.userId, users.id))
    .where(
      and(
        eq(venueRoleAssignments.venueId, venueId),
        eq(venueRoleAssignments.roleId, roleId),
        lte(venueRoleAssignments.effectiveFrom, at),
        or(
          isNull(venueRoleAssignments.effectiveTo),
          gt(venueRoleAssignments.effectiveTo, at),
        ),
      ),
    );

  return rows;
}
