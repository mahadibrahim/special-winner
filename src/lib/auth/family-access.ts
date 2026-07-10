/**
 * Guardian-resolution helper for `family_members` access.
 *
 * The people model (see CLAUDE.md "People model") allows more than one
 * account to legitimately read a given family member's data:
 *   - the primary guardian (`familyMembers.parentUserId`)
 *   - the adult self-registered player (`familyMembers.selfUserId`)
 *   - any additional co-parent/guardian linked via the `family_member_parents`
 *     join table (`familyMemberParents.parentUserId`)
 *
 * Endpoints that previously checked only `parentUserId === user.id` locked
 * out co-parents and self-registered adults. Use `canAccessFamilyMember` (or
 * the `requireFamilyMemberAccess` convenience wrapper) instead of rolling a
 * bespoke ownership check.
 */
import type { getDb } from "@/lib/db";
import { eq, and } from "drizzle-orm";
import { familyMembers } from "@/lib/db/schema/registrations";
import { familyMemberParents } from "@/lib/db/schema/family-member-parents";

type Db = ReturnType<typeof getDb>;

/**
 * True if `userId` may access `familyMemberId`'s data: they are the primary
 * guardian, the self-registered adult, or a linked co-parent/guardian.
 * False if the family member doesn't exist at all.
 */
export async function canAccessFamilyMember(
  db: Db,
  userId: string,
  familyMemberId: string,
): Promise<boolean> {
  const [member] = await db
    .select({
      parentUserId: familyMembers.parentUserId,
      selfUserId: familyMembers.selfUserId,
    })
    .from(familyMembers)
    .where(eq(familyMembers.id, familyMemberId));

  if (!member) return false;
  if (member.parentUserId === userId || member.selfUserId === userId) {
    return true;
  }

  const [link] = await db
    .select({ id: familyMemberParents.id })
    .from(familyMemberParents)
    .where(
      and(
        eq(familyMemberParents.familyMemberId, familyMemberId),
        eq(familyMemberParents.parentUserId, userId),
      ),
    );

  return !!link;
}

/**
 * Convenience wrapper for endpoints that just need a boolean gate plus the
 * standard "does the resource exist at all" signal, without hand-rolling the
 * two-step canAccessFamilyMember flow inline.
 *
 * Returns:
 *   - { ok: true }                  — access granted
 *   - { ok: false, reason: "denied" } — family member exists, caller isn't a guardian
 *
 * Callers still need their own "not found at all" check before this if they
 * want to distinguish 404 from 403 — this helper only answers "can they see
 * it", not "does it exist".
 */
export async function requireFamilyMemberAccess(
  db: Db,
  userId: string,
  familyMemberId: string,
): Promise<{ ok: true } | { ok: false; reason: "denied" }> {
  const allowed = await canAccessFamilyMember(db, userId, familyMemberId);
  return allowed ? { ok: true } : { ok: false, reason: "denied" };
}
