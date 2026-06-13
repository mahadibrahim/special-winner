/**
 * Venue-role authorization helper.
 *
 * Mirrors the effective-window query in `resolve-recipients.ts`, but answers
 * the inverse question: "does THIS user currently hold THIS role at THIS
 * venue?" — used to gate role-attested actions (e.g. signing off a
 * signature-method activity completion) so a caller can't mint an attestation
 * for a role/venue they don't actually hold.
 *
 * `roleId` is the 'role.<id>' catalog ref string stored on
 * `venue_role_assignments.role_id` — the same format as a catalog activity's
 * `required_role`, so callers pass that value straight through.
 *
 * Effective-window semantics (identical to resolve-recipients):
 *   effective_from <= at    AND    (effective_to IS NULL OR effective_to > at)
 */
import { getDb } from "@/lib/db";
import { venueRoleAssignments } from "@/lib/db/schema/activity-tracking";
import { and, eq, gt, isNull, lte, or } from "drizzle-orm";

export async function userHoldsVenueRole(
  venueId: string,
  roleId: string,
  userId: string,
  at: Date = new Date(),
): Promise<boolean> {
  const [row] = await getDb()
    .select({ id: venueRoleAssignments.id })
    .from(venueRoleAssignments)
    .where(
      and(
        eq(venueRoleAssignments.venueId, venueId),
        eq(venueRoleAssignments.roleId, roleId),
        eq(venueRoleAssignments.userId, userId),
        lte(venueRoleAssignments.effectiveFrom, at),
        or(
          isNull(venueRoleAssignments.effectiveTo),
          gt(venueRoleAssignments.effectiveTo, at),
        ),
      ),
    )
    .limit(1);

  return !!row;
}
