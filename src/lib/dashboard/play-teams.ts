import { getDb } from "@/lib/db";
import { familyMembers, registrations } from "@/lib/db/schema/registrations";
import { rosters } from "@/lib/db/schema/teams";
import { eq, inArray } from "drizzle-orm";

/**
 * Team ids the user plays on: their self family members → registrations
 * → roster spots → teams. Returns [] for a user who is not on any team.
 */
export async function getPlayerTeamIds(userId: string): Promise<string[]> {
  const db = getDb();
  const selves = await db
    .select({ id: familyMembers.id })
    .from(familyMembers)
    .where(eq(familyMembers.selfUserId, userId));
  if (selves.length === 0) return [];

  const regs = await db
    .select({ id: registrations.id })
    .from(registrations)
    .where(inArray(registrations.familyMemberId, selves.map((s) => s.id)));
  if (regs.length === 0) return [];

  // v1: all rostered teams shown regardless of roster status
  const rosterRows = await db
    .select({ teamId: rosters.teamId })
    .from(rosters)
    .where(inArray(rosters.registrationId, regs.map((r) => r.id)));
  return [...new Set(rosterRows.map((r) => r.teamId))];
}
